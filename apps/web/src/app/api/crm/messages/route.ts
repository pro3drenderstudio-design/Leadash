/**
 * GET /api/crm/messages?conversation_id=&before=&after=&limit=
 *
 * Returns a page of messages in a conversation, ordered chronologically.
 * Used by the CRM inbox thread view.
 *
 *  - No cursor: latest `limit` messages (initial load).
 *  - `before` (ISO timestamp): the `limit` messages immediately older than
 *    it — used for scrolling up to load history.
 *  - `after` (ISO timestamp): messages newer than it (uncapped by `limit`
 *    beyond a generous ceiling) — used by the 30s poll to fetch only what's
 *    new without re-fetching (and so discarding) already-loaded history.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const SELECT = `
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
`;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const conversationId = sp.get("conversation_id");
  if (!conversationId) return NextResponse.json({ error: "conversation_id required" }, { status: 400 });

  const before = sp.get("before");
  const after  = sp.get("after");
  const limit  = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 200);

  if (after) {
    const { data, error } = await db
      .from("crm_messages")
      .select(SELECT)
      .eq("conversation_id", conversationId)
      .gt("created_at", after)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data ?? [], has_more: false });
  }

  let query = db
    .from("crm_messages")
    .select(SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data ?? []).reverse();
  return NextResponse.json({ messages, has_more: (data ?? []).length === limit });
}
