import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

// Fixed slug used to aggregate all /whatsapp_send/ clicks under one tracked link
const WA_SEND_SLUG = "whatsapp-dm";

function parseDevice(ua: string): { device_type: string; browser: string; os: string } {
  const mobile = /android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua);
  const tablet = /ipad|tablet/i.test(ua);
  const bot    = /bot|crawl|spider|slurp|facebookexternalhit/i.test(ua);
  const device_type = bot ? "bot" : tablet ? "tablet" : mobile ? "mobile" : "desktop";
  const browser =
    /edg\//i.test(ua)  ? "Edge"    :
    /chrome/i.test(ua) ? "Chrome"  :
    /safari/i.test(ua) ? "Safari"  :
    /firefox/i.test(ua)? "Firefox" :
    /opr\//i.test(ua)  ? "Opera"   : "Other";
  const os =
    /windows nt/i.test(ua)        ? "Windows" :
    /mac os x/i.test(ua)          ? "macOS"   :
    /android/i.test(ua)           ? "Android" :
    /iphone|ipad|ipod/i.test(ua)  ? "iOS"     :
    /linux/i.test(ua)             ? "Linux"   : "Other";
  return { device_type, browser, os };
}

/**
 * GET /whatsapp_send/
 *
 * Proxies WhatsApp deep-link clicks through our own domain so Meta's
 * in-app browser doesn't immediately detect the destination as a WhatsApp URL.
 * Also records each click in the admin link tracker under the "whatsapp-dm" slug.
 *
 * Accepts the same query params as api.whatsapp.com/send/:
 *   phone, text, type, app_absent
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const waUrl = new URL("https://api.whatsapp.com/send/");
  searchParams.forEach((value, key) => { waUrl.searchParams.set(key, value); });

  const destination = waUrl.toString();
  const res = NextResponse.redirect(destination, 302);
  res.headers.set("Cache-Control", "no-store");

  // ── Fire-and-forget click tracking ───────────────────────────────────────
  void (async () => {
    try {
      const db = createAdminClient();

      // Look up (or auto-create) the tracked link for all WA send clicks
      let { data: link } = await db
        .from("tracked_links")
        .select("id")
        .eq("slug", WA_SEND_SLUG)
        .maybeSingle();

      if (!link) {
        const { data: created } = await db
          .from("tracked_links")
          .insert({
            slug:            WA_SEND_SLUG,
            title:           "WhatsApp DM (Challenge Signups)",
            destination_url: "https://api.whatsapp.com/send/",
            is_active:       true,
          })
          .select("id")
          .single();
        link = created;
      }

      if (!link) return;

      // Visitor dedup via cookie
      const visitorId = req.cookies.get("_ld_vid")?.value ?? null;

      const forwardedFor = req.headers.get("x-forwarded-for");
      const rawIp = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
      const ipHash = createHash("sha256").update(rawIp).digest("hex").slice(0, 16);

      const ua = req.headers.get("user-agent") ?? "";
      const referrer = req.headers.get("referer") ?? null;
      const { device_type, browser, os } = parseDevice(ua);

      const isUnique = !visitorId
        ? true
        : !(await db
            .from("tracked_link_clicks")
            .select("id", { count: "exact", head: true })
            .eq("link_id", link.id)
            .eq("visitor_id", visitorId)
            .then((r: { count: number | null }) => (r.count ?? 0) > 0));

      await db.from("tracked_link_clicks").insert({
        link_id:    link.id,
        ip_hash:    ipHash,
        device_type,
        browser,
        os,
        referrer,
        visitor_id: visitorId,
      });

      await db.rpc("increment_link_clicks" as never, {
        p_link_id:   link.id,
        p_is_unique: isUnique,
      } as never);
    } catch (e) {
      console.error("[whatsapp_send] tracking error:", e);
    }
  })();

  // Set visitor cookie for future dedup if first visit
  const visitorId = req.cookies.get("_ld_vid")?.value;
  if (!visitorId) {
    res.cookies.set("_ld_vid", crypto.randomUUID(), {
      maxAge:   365 * 24 * 60 * 60,
      path:     "/",
      sameSite: "lax",
    });
  }

  return res;
}
