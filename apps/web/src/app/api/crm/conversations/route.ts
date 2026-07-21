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

  // If the user typed something, resolve matching contact IDs first so we
  // can filter by contact name/email/whatsapp/phone in addition to the
  // conversation's own subject + channel_identifier. Trigram indexes on
  // crm_contacts (mig 20260722100000) keep this fast even at scale.
  let matchingContactIds: string[] | null = null;
  if (search) {
    const s = search.trim();
    if (s.length > 0) {
      const { data: matches } = await db
        .from("crm_contacts")
        .select("id")
        .or(`display_name.ilike.%${s}%,email.ilike.%${s}%,whatsapp_number.ilike.%${s}%,phone.ilike.%${s}%`)
        .limit(500);
      matchingContactIds = (matches ?? []).map((m: { id: string }) => m.id);
    }
  }

  // Read the denormalised last_message_* columns instead of joining
  // crm_messages. The list used to pull every message per conversation
  // (5,000+ rows on a busy inbox) and throw all but the newest away
  // client-side — that's what made the page load slow.
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
      last_message_snippet,
      last_message_direction,
      created_at,
      tags,
      crm_contacts (
        id,
        display_name,
        email,
        whatsapp_number,
        phone,
        user_id
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
    const s = search.trim();
    // Match on subject/channel_identifier OR any conversation whose contact
    // matched the earlier contact-search. Empty-contact-match array is
    // encoded as a single impossible UUID so the .in clause returns no
    // extra rows (Supabase treats an empty array as always-false).
    const contactIdList = (matchingContactIds && matchingContactIds.length > 0)
      ? matchingContactIds.join(",")
      : "00000000-0000-0000-0000-000000000000";
    query = query.or(
      `subject.ilike.%${s}%,channel_identifier.ilike.%${s}%,contact_id.in.(${contactIdList})`,
    );
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const conversations = hasMore ? rows.slice(0, limit) : rows;

  // Shape the response so the client keeps the same latest_message shape it
  // rendered before — cheaper than a client-side refactor.
  const withLatest = conversations.map((c: Record<string, unknown>) => ({
    ...c,
    latest_message: c.last_message_snippet
      ? {
          body:      c.last_message_snippet as string,
          direction: c.last_message_direction as string,
          channel:   c.channel as string,
          created_at: c.last_message_at as string,
        }
      : null,
  }));

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
