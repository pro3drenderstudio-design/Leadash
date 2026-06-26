import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// POST — record funnel session or page event (public, no auth required)
export async function POST(req: NextRequest) {
  const db = createAdminClient();

  const body = await req.json() as {
    type: "session" | "event";
    funnel_id?: string;
    session_id?: string;
    page_id?: string;
    variant_id?: string;
    event_type?: string;
    metadata?: Record<string, unknown>;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    referrer?: string;
    device?: string;
    country?: string;
  };

  if (body.type === "session") {
    if (!body.funnel_id || !body.session_id) {
      return NextResponse.json({ error: "funnel_id and session_id required" }, { status: 400 });
    }
    // Upsert session
    const { error } = await db.from("funnel_sessions").upsert({
      funnel_id: body.funnel_id,
      session_id: body.session_id,
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
      utm_content: body.utm_content,
      utm_term: body.utm_term,
      referrer: body.referrer,
      device: body.device,
      country: body.country,
    }, { onConflict: "session_id" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "event") {
    if (!body.session_id || !body.page_id || !body.event_type) {
      return NextResponse.json({ error: "session_id, page_id, event_type required" }, { status: 400 });
    }
    const { error } = await db.from("funnel_page_events").insert({
      session_id: body.session_id,
      page_id: body.page_id,
      variant_id: body.variant_id ?? null,
      event_type: body.event_type,
      metadata: body.metadata ?? {},
      occurred_at: new Date().toISOString(),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
