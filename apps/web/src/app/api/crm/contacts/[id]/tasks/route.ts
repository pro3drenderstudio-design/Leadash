/**
 * GET  /api/crm/contacts/[id]/tasks        — list tasks for a contact
 * POST /api/crm/contacts/[id]/tasks        — create task
 * PATCH /api/crm/contacts/[id]/tasks?task= — complete / update task
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;
  const { id } = await params;

  const includeCompleted = req.nextUrl.searchParams.get("completed") === "true";

  let query = db
    .from("crm_tasks")
    .select("*")
    .eq("contact_id", id)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (!includeCompleted) query = query.is("completed_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { user, db } = ctx;
  const { id } = await params;

  const body = await req.json() as { title: string; due_at?: string; conversation_id?: string };
  if (!body.title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data, error } = await db
    .from("crm_tasks")
    .insert({
      contact_id:      id,
      conversation_id: body.conversation_id ?? null,
      created_by:      user.id,
      title:           body.title.trim(),
      due_at:          body.due_at ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;
  const { id: contactId } = await params;

  const taskId = req.nextUrl.searchParams.get("task");
  if (!taskId) return NextResponse.json({ error: "Missing task query param" }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if ("completed" in body) {
    patch.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if ("title"   in body) patch.title   = body.title;
  if ("due_at"  in body) patch.due_at  = body.due_at;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("crm_tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("contact_id", contactId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}
