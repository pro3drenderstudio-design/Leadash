import { exec } from "child_process";
import { promisify } from "util";
import { adminClient } from "../lib/supabase";

const execAsync = promisify(exec);

async function postalQuery(sql: string): Promise<string[][]> {
  const escaped = sql.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const cmd = `docker exec postal-mariadb-1 mysql -upostal -ppostalpass --batch --skip-column-names "postal-server-1" -e "${escaped}"`;
  try {
    const { stdout } = await execAsync(cmd, { timeout: 12_000 });
    return stdout.trim().split("\n").filter(Boolean).map(r => r.split("\t"));
  } catch {
    return [];
  }
}

/**
 * Syncs Postal's internal suppression list to Supabase.
 *
 * For every address Postal has suppressed (hard fail or soft fail exhaustion)
 * that is not yet in email_suppressions:
 *   1. Insert into email_suppressions (reason: hard_bounce)
 *   2. Mark all active outreach_enrollments for that email as bounced
 *   3. Mark all outreach_leads with that email as bounced
 *
 * Runs every 15 minutes from the scheduler — same cadence as reply-poll.
 */
export async function syncPostalSuppressions(): Promise<void> {
  // Fetch all suppressed addresses from Postal
  const rows = await postalQuery(
    "SELECT address FROM suppressions WHERE type = 'recipient'",
  );
  if (!rows.length) return;

  const postalEmails = rows.map(r => r[0]?.toLowerCase()).filter(Boolean);
  if (!postalEmails.length) return;

  const db = adminClient();

  // Find which are already in our table (avoid redundant work)
  const { data: existing } = await db
    .from("email_suppressions")
    .select("email")
    .in("email", postalEmails);

  const alreadySuppressed = new Set((existing ?? []).map(r => r.email.toLowerCase()));
  const newlySuppressed   = postalEmails.filter(e => !alreadySuppressed.has(e));

  if (!newlySuppressed.length) return;

  console.log(`[suppression-sync] ${newlySuppressed.length} new suppressions from Postal:`, newlySuppressed);

  // 1. Upsert into email_suppressions
  await db.from("email_suppressions").upsert(
    newlySuppressed.map(email => ({
      email,
      reason:              "hard_bounce" as const,
      source_workspace_id: null,
    })),
    { onConflict: "email", ignoreDuplicates: true },
  );

  // 2 + 3. Bounce enrollments and leads in batches (Supabase .in() has ~400-item practical limit)
  const BATCH = 200;
  for (let i = 0; i < newlySuppressed.length; i += BATCH) {
    const chunk = newlySuppressed.slice(i, i + BATCH);

    // Find matching leads by email
    const { data: leads } = await db
      .from("outreach_leads")
      .select("id, workspace_id")
      .in("email", chunk)
      .neq("status", "bounced");

    if (!leads?.length) continue;

    const leadIds = leads.map(l => l.id);

    // Bounce the leads
    await db
      .from("outreach_leads")
      .update({ status: "bounced" })
      .in("id", leadIds);

    // Bounce their active enrollments
    await db
      .from("outreach_enrollments")
      .update({ status: "bounced" })
      .in("lead_id", leadIds)
      .in("status", ["active", "paused"]);

    console.log(`[suppression-sync] bounced ${leadIds.length} leads for chunk ${i / BATCH + 1}`);
  }

  // 4. Disable warmup for any inbox whose email_address is suppressed.
  // Without this, the warmup pool keeps sending to the suppressed address and
  // Postal holds every message, silently inflating the held-message count.
  await db
    .from("outreach_inboxes")
    .update({ warmup_enabled: false, status: "error", last_error: "Address suppressed — Postal refused delivery" })
    .in("email_address", newlySuppressed);

  console.log(`[suppression-sync] disabled warmup for ${newlySuppressed.length} suppressed inbox addresses`);
}
