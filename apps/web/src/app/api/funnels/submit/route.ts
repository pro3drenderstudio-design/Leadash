import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { enqueueAutomation } from "@/lib/queue/client";
import { normalisePhoneNG } from "@/lib/phone";

// POST — handle optin form submission
export async function POST(req: NextRequest) {
  const db = createAdminClient();

  const body = await req.json() as {
    page_id: string;
    session_id?: string;
    data: {
      email?: string;
      name?: string;
      phone?: string;
      whatsapp?: string;
      [key: string]: unknown;
    };
    connect_crm?: boolean;
    redirect_url?: string;
  };

  const { page_id, session_id, data, connect_crm } = body;
  if (!page_id) return NextResponse.json({ error: "page_id required" }, { status: 400 });

  // Normalise the phone / whatsapp field the funnel form collected. Some
  // funnels label the field "phone", others "whatsapp"; accept either. Storing
  // the E.164-shaped (234…) form is what makes CRM linkage work when the same
  // person later messages us on WhatsApp (whose wa_id also arrives without +).
  const rawPhone      = (data.phone ?? data.whatsapp) as string | undefined;
  const normalisedNG  = normalisePhoneNG(rawPhone ?? null);

  let contact_id: string | null = null;

  // Upsert CRM contact if requested and email provided
  if (connect_crm && data.email) {
    const { data: existing } = await db
      .from("crm_contacts")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();

    if (existing) {
      contact_id = existing.id;
      const updates: Record<string, string> = {};
      if (data.name)     updates.display_name    = data.name as string;
      if (normalisedNG)  updates.whatsapp_number = normalisedNG;
      if (Object.keys(updates).length > 0) {
        await db.from("crm_contacts").update(updates).eq("id", existing.id);
      }
    } else {
      const { data: newContact } = await db
        .from("crm_contacts")
        .insert({
          email: data.email,
          display_name: (data.name as string) ?? data.email,
          whatsapp_number: normalisedNG,
        })
        .select("id")
        .single();
      contact_id = newContact?.id ?? null;
    }
  }

  // Save submission
  const { error } = await db.from("funnel_submissions").insert({
    page_id,
    session_id: session_id ?? null,
    contact_id,
    data,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Fire automation trigger ─────────────────────────────────────────────
  // Look up which funnel this page belongs to so automations can filter by
  // funnel_slug (e.g. only the 7-day-challenge flow reacts).
  const { data: pageRow } = await db
    .from("funnel_pages")
    .select("slug, funnel:funnels(slug)")
    .eq("id", page_id)
    .maybeSingle();

  type FunnelRef = { slug?: string | null };
  const funnelSlug = (pageRow?.funnel as FunnelRef | null)?.slug ?? null;
  const pageSlug   = (pageRow?.slug   as string   | null) ?? null;

  await enqueueAutomation({
    event:        "funnel.form_submitted",
    workspace_id: null,   // funnel forms are anonymous — no workspace context
    user_id:      null,
    payload: {
      page_id,
      page_slug:    pageSlug,
      funnel_slug:  funnelSlug,
      contact_id,
      email:        data.email ?? null,
      name:         data.name  ?? null,
      phone:        normalisedNG,
      raw_phone:    rawPhone   ?? null,
      form_data:    data,
    },
  }).catch(err => console.error("[funnels/submit] automation enqueue error:", err));

  return NextResponse.json({ ok: true, contact_id, redirect_url: body.redirect_url ?? null });
}
