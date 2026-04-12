import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("support_tickets")
    .select("id, ticket_number, subject, category, priority, status, admin_reply, admin_replied_at, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, userId, db } = auth;

  const { subject, message, category, priority } = await req.json() as {
    subject:   string;
    message:   string;
    category?: string;
    priority?: string;
  };

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "subject and message are required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("support_tickets")
    .insert({
      workspace_id: workspaceId,
      user_id:      userId,
      subject:      subject.trim(),
      message:      message.trim(),
      category:     category ?? "general",
      priority:     priority ?? "medium",
    })
    .select("id, ticket_number, subject, status, created_at")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Failed to create ticket" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
