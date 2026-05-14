import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function ipHash(req: NextRequest): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sendId  = searchParams.get("s");
  const type    = searchParams.get("t") ?? "open"; // "open" | "click"
  const linkIdx = searchParams.get("l");
  const redirect = searchParams.get("r");

  if (sendId) {
    const db  = createAdminClient();
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const hash = ipHash(req);

    const { error: dedupErr } = await db.from("track_event_log").insert({
      send_id:    sendId,
      event_type: type,
      ip_hash:    hash,
      day,
    });

    if (!dedupErr) {
      // First event of this type from this IP for this send today — record it
      if (type === "open") {
        await db.rpc("track_open", { p_send_id: sendId }).catch(() => {});
      } else if (type === "click" && linkIdx !== null) {
        await db.rpc("track_click", { p_send_id: sendId, p_link_index: parseInt(linkIdx) }).catch(() => {});
      }
    }
  }

  if (type === "click" && redirect) {
    return NextResponse.redirect(decodeURIComponent(redirect));
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type":  "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma":        "no-cache",
    },
  });
}
