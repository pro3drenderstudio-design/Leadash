import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { sendAdminNewTicketNotification } from "@/lib/email/notifications";

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

  // Also insert the initial message into ticket_messages for thread continuity
  await db.from("ticket_messages").insert({
    ticket_id:   data.id,
    sender_type: "user",
    user_id:     userId,
    message:     message.trim(),
  }).select().single().catch(() => null);

  // Notify admin (fire-and-forget — don't block the response)
  (async () => {
    try {
      const adminDb = createAdminClient();
      const [
        { data: setting },
        { data: { user: ticketUser } },
      ] = await Promise.all([
        adminDb.from("admin_settings").select("value").eq("key", "support_email").single(),
        adminDb.auth.admin.getUserById(userId),
      ]);
      const adminEmail = (setting?.value as string) ?? "";
      if (adminEmail && ticketUser?.email) {
        await sendAdminNewTicketNotification({
          adminEmail,
          ticketNumber: data.ticket_number,
          subject:      data.subject,
          message:      message.trim(),
          userEmail:    ticketUser.email,
          category:     category ?? "general",
          priority:     priority ?? "medium",
          ticketId:     data.id,
        });
      }
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json(data, { status: 201 });
}
