import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

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
      [key: string]: unknown;
    };
    connect_crm?: boolean;
    redirect_url?: string;
  };

  const { page_id, session_id, data, connect_crm } = body;
  if (!page_id) return NextResponse.json({ error: "page_id required" }, { status: 400 });

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
      // Update name/phone if provided
      const updates: Record<string, string> = {};
      if (data.name) updates.display_name = data.name as string;
      if (data.phone) updates.whatsapp_number = data.phone as string;
      if (Object.keys(updates).length > 0) {
        await db.from("crm_contacts").update(updates).eq("id", existing.id);
      }
    } else {
      const { data: newContact } = await db
        .from("crm_contacts")
        .insert({
          email: data.email,
          display_name: (data.name as string) ?? data.email,
          whatsapp_number: (data.phone as string) ?? null,
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

  return NextResponse.json({ ok: true, contact_id, redirect_url: body.redirect_url ?? null });
}
