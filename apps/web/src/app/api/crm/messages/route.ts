/**
 * GET /api/crm/messages?conversation_id=
 *
 * Returns all messages in a conversation, ordered chronologically.
 * Used by the CRM inbox thread view.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const conversationId = req.nextUrl.searchParams.get("conversation_id");
  if (!conversationId) return NextResponse.json({ error: "conversation_id required" }, { status: 400 });

  const { data, error } = await db
    .from("crm_messages")
    .select(`
      id,
      direction,
      channel,
      body,
      body_html,
      subject,
      from_address,
      from_name,
      wa_message_type,
      provider_message_id,
      status,
      delivered_at,
      read_at,
      sent_by,
      created_at,
      attachments,
      location,
      contacts
    `)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: data ?? [] });
}
