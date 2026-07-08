import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

function parseDevice(ua: string): { device_type: string; browser: string; os: string } {
  const mobile  = /android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua);
  const tablet  = /ipad|tablet/i.test(ua);
  const bot     = /bot|crawl|spider|slurp|facebookexternalhit/i.test(ua);
  const device_type = bot ? "bot" : tablet ? "tablet" : mobile ? "mobile" : "desktop";

  const browser =
    /edg\//i.test(ua)     ? "Edge"    :
    /chrome/i.test(ua)    ? "Chrome"  :
    /safari/i.test(ua)    ? "Safari"  :
    /firefox/i.test(ua)   ? "Firefox" :
    /opr\//i.test(ua)     ? "Opera"   : "Other";

  const os =
    /windows nt/i.test(ua)     ? "Windows" :
    /mac os x/i.test(ua)       ? "macOS"   :
    /android/i.test(ua)        ? "Android" :
    /iphone|ipad|ipod/i.test(ua) ? "iOS"   :
    /linux/i.test(ua)          ? "Linux"   : "Other";

  return { device_type, browser, os };
}

// GET /go/[slug] — resolve redirect and record click
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const db = createAdminClient();

  const { data: link } = await db
    .from("tracked_links")
    .select("id, destination_url, is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (!link || !link.is_active) {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  // Extract visitor fingerprint from cookie for unique-click dedup
  const visitorId = req.cookies.get("_ld_vid")?.value ?? null;

  // Hash the IP for privacy (never store raw IP)
  const forwardedFor = req.headers.get("x-forwarded-for");
  const rawIp = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(rawIp).digest("hex").slice(0, 16);

  const ua          = req.headers.get("user-agent") ?? "";
  const referrer    = req.headers.get("referer") ?? null;
  const { device_type, browser, os } = parseDevice(ua);

  // Fire-and-forget click record (don't await — user gets redirect immediately)
  void (async () => {
    const isUnique = !visitorId
      ? true
      : !(await db
          .from("tracked_link_clicks")
          .select("id", { count: "exact", head: true })
          .eq("link_id", link.id)
          .eq("visitor_id", visitorId)
          .then(r => (r.count ?? 0) > 0));

    await db.from("tracked_link_clicks").insert({
      link_id:     link.id,
      ip_hash:     ipHash,
      device_type,
      browser,
      os,
      referrer,
      visitor_id:  visitorId,
    });

    // Increment counters atomically
    await db.rpc("increment_link_clicks" as never, {
      p_link_id:  link.id,
      p_is_unique: isUnique,
    } as never);
  })();

  // Set visitor cookie if missing (1-year expiry)
  const newVisitorId = visitorId ?? crypto.randomUUID();
  const res = NextResponse.redirect(link.destination_url as string, 302);
  if (!visitorId) {
    res.cookies.set("_ld_vid", newVisitorId, {
      maxAge: 365 * 24 * 60 * 60,
      path:   "/",
      sameSite: "lax",
    });
  }
  return res;
}
