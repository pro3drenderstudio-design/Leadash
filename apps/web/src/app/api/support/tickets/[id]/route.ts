import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const [{ data: ticket, error }, { data: messages }] = await Promise.all([
    db.from("support_tickets")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single(),
    db.from("ticket_messages")
      .select("id, sender_type, message, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (error || !ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...ticket, messages: messages ?? [] });
}
