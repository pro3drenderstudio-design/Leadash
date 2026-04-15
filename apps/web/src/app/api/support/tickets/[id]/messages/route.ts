import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, userId, db } = auth;

  const { message } = await req.json() as { message?: string };
  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Verify the ticket belongs to this workspace
  const { data: ticket } = await db
    .from("support_tickets")
    .select("id, status")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.status === "closed") {
    return NextResponse.json({ error: "This ticket is closed" }, { status: 400 });
  }

  // Insert user message
  const { data: msg, error } = await db
    .from("ticket_messages")
    .insert({
      ticket_id:   id,
      sender_type: "user",
      user_id:     userId,
      message:     message.trim(),
    })
    .select("id, sender_type, message, created_at")
    .single();

  if (error || !msg) {
    return NextResponse.json({ error: error?.message ?? "Failed to send" }, { status: 500 });
  }

  // If ticket was waiting_on_you, reopen it
  if (ticket.status === "waiting_on_you") {
    await db
      .from("support_tickets")
      .update({ status: "open", updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  return NextResponse.json(msg, { status: 201 });
}
