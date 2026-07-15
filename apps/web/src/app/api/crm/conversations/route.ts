/**
 * GET  /api/crm/conversations        — list conversations (paginated, filtered)
 * PATCH /api/crm/conversations?id=   — update status, assignment, snooze
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const sp = req.nextUrl.searchParams;

  const inbox    = sp.get("inbox")   ?? undefined;
  const status   = sp.get("status")  ?? "open";
  const channel  = sp.get("channel") ?? undefined;
  const assignee = sp.get("assignee") ?? undefined;
  const search   = sp.get("search")  ?? undefined;
  const cursor   = sp.get("cursor")  ?? undefined;
  const tag      = sp.get("tag")     ?? undefined;
  const from     = sp.get("from")    ?? undefined; // ISO date/datetime, inclusive lower bound on last_message_at
  const to       = sp.get("to")      ?? undefined; // ISO date/datetime, inclusive upper bound on last_message_at
  const limit    = Math.min(Number(sp.get("limit") ?? "25"), 100);

  let query = db
    .from("crm_conversations")
    .select(`
      id,
      channel,
      inbox_address,
      channel_identifier,
      subject,
      status,
      assigned_to,
      snooze_until,
      unread_count,
      last_message_at,
      last_inbound_at,
      created_at,
      tags,
      crm_contacts (
        id,
        display_name,
        email,
        whatsapp_number,
        user_id
      ),
      crm_messages (
        id,
        direction,
        body,
        channel,
        created_at
      )
    `)
    .order("last_message_at", { ascending: false })
    .limit(limit + 1);

  if (status !== "all") query = query.eq("status", status);
  if (inbox)   query = query.eq("inbox_address", inbox);
  if (channel) query = query.eq("channel", channel);
  if (assignee) query = query.eq("assigned_to", assignee);
  if (cursor)  query = query.lt("last_message_at", cursor);
  if (tag)     query = query.contains("tags", [tag]);
  if (from)    query = query.gte("last_message_at", from);
  if (to)      query = query.lte("last_message_at", to);

  if (search) {
    query = query.or(`subject.ilike.%${search}%,channel_identifier.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const conversations = hasMore ? rows.slice(0, limit) : rows;

  // Attach latest message to each conversation
  const withLatest = conversations.map((c: Record<string, unknown>) => {
    const msgs = (c.crm_messages as Array<Record<string, unknown>> | null) ?? [];
    const sorted = [...msgs].sort((a, b) =>
      new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    );
    return { ...c, crm_messages: undefined, latest_message: sorted[0] ?? null };
  });

  const nextCursor = hasMore
    ? (conversations[conversations.length - 1] as Record<string, unknown>).last_message_at
    : null;

  return NextResponse.json({ conversations: withLatest, next_cursor: nextCursor, has_more: hasMore });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;

  const allowed: Record<string, unknown> = {};
  if ("status"        in body) allowed.status        = body.status;
  if ("assigned_to"   in body) allowed.assigned_to   = body.assigned_to;
  if ("snooze_until" in body) allowed.snooze_until = body.snooze_until;
  if ("unread_count"  in body) allowed.unread_count  = body.unread_count;
  if ("tags"          in body) allowed.tags          = body.tags;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("crm_conversations")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ conversation: data });
}

// GET /api/crm/conversations/[id]/messages is handled via the list query above (join).
// A dedicated messages endpoint can be added when thread pagination is needed.
