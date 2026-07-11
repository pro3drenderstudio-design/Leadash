/**
 * Push notification worker — fans a PushJob out to every registered device in
 * the workspace, gated by each user's notification preferences.
 *
 * Gates suppress the push banner only; the mobile_notifications feed row is
 * always written (per type toggle), so nothing is lost to quiet hours or the
 * positive-only filter.
 */
import { Job } from "bullmq";
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { adminClient } from "../lib/supabase";

interface PushJob {
  type:           "reply" | "milestone" | "health";
  workspace_id:   string;
  title:          string;
  body?:          string;
  enrollment_id?: string;
  campaign_id?:   string;
  inbox_id?:      string;
  ai_category?:   string | null;
}

interface PrefsRow {
  user_id:            string;
  replies_enabled:    boolean;
  positive_only:      boolean;
  milestones_enabled: boolean;
  health_enabled:     boolean;
  quiet_hours_start:  number | null;
  quiet_hours_end:    number | null;
  timezone:           string | null;
}

const expo = new Expo();

const POSITIVE_CATEGORIES = new Set(["interested", "meeting_booked"]);

function typeEnabled(type: PushJob["type"], prefs: PrefsRow | undefined): boolean {
  if (!prefs) return true; // defaults: everything on
  if (type === "reply")     return prefs.replies_enabled;
  if (type === "milestone") return prefs.milestones_enabled;
  return prefs.health_enabled;
}

function inQuietHours(prefs: PrefsRow | undefined): boolean {
  if (!prefs || prefs.quiet_hours_start == null || prefs.quiet_hours_end == null) return false;
  const tz = prefs.timezone ?? "UTC";
  let minutes: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === "hour")!.value, 10) % 24;
    const m = parseInt(parts.find(p => p.type === "minute")!.value, 10);
    minutes = h * 60 + m;
  } catch {
    return false;
  }
  const { quiet_hours_start: start, quiet_hours_end: end } = prefs;
  // Window may wrap past midnight (e.g. 22:00 → 07:00)
  return start <= end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

export async function processPush(job: Job): Promise<void> {
  const payload = job.data as PushJob;
  const db = adminClient();

  const [{ data: tokens }, { data: prefsRows }] = await Promise.all([
    db.from("mobile_device_tokens")
      .select("user_id, expo_push_token")
      .eq("workspace_id", payload.workspace_id),
    db.from("mobile_notification_prefs")
      .select("*")
      .eq("workspace_id", payload.workspace_id),
  ]);

  if (!tokens?.length) return; // no mobile devices in this workspace

  const prefsByUser = new Map<string, PrefsRow>();
  for (const p of (prefsRows ?? []) as PrefsRow[]) prefsByUser.set(p.user_id, p);

  const userIds = [...new Set(tokens.map(t => t.user_id as string))];
  const data = {
    type:          payload.type,
    enrollment_id: payload.enrollment_id,
    campaign_id:   payload.campaign_id,
    inbox_id:      payload.inbox_id,
  };

  // 1. Feed rows — for every user whose type toggle is on
  const feedRows = userIds
    .filter(uid => typeEnabled(payload.type, prefsByUser.get(uid)))
    .map(uid => ({
      workspace_id: payload.workspace_id,
      user_id:      uid,
      type:         payload.type,
      title:        payload.title,
      body:         payload.body ?? null,
      data:         { ...data, ai_category: payload.ai_category ?? undefined },
    }));
  if (feedRows.length) {
    const { error } = await db.from("mobile_notifications").insert(feedRows);
    if (error) console.error("[push] feed insert failed:", error.message);
  }

  // 2. Push banners — additionally gated by positive-only + quiet hours
  const messages: ExpoPushMessage[] = [];
  const tokenOwner = new Map<string, string>();

  for (const t of tokens) {
    const prefs = prefsByUser.get(t.user_id as string);
    if (!typeEnabled(payload.type, prefs)) continue;
    if (payload.type === "reply" && prefs?.positive_only &&
        !POSITIVE_CATEGORIES.has(payload.ai_category ?? "")) continue;
    if (inQuietHours(prefs)) continue;

    const token = t.expo_push_token as string;
    if (!Expo.isExpoPushToken(token)) continue;
    tokenOwner.set(token, t.user_id as string);
    messages.push({
      to:    token,
      sound: "default",
      title: payload.title,
      body:  payload.body,
      data,
    });
  }

  if (!messages.length) return;

  const staleTokens: string[] = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === "error") {
          const to = chunk[i].to as string;
          if (ticket.details?.error === "DeviceNotRegistered") staleTokens.push(to);
          else console.error(`[push] ticket error for ${to}:`, ticket.message);
        }
      });
    } catch (e) {
      console.error("[push] send chunk failed:", e);
    }
  }

  // Drop tokens for uninstalled/expired devices
  if (staleTokens.length) {
    await db.from("mobile_device_tokens")
      .delete()
      .eq("workspace_id", payload.workspace_id)
      .in("expo_push_token", staleTokens);
    console.log(`[push] removed ${staleTokens.length} stale device token(s)`);
  }

  console.log(`[push] ${payload.type} → ${messages.length} device(s), ${feedRows.length} feed row(s)`);
}
