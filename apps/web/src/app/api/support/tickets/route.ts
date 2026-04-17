import { NextRequest, NextResponse, after } from "next/server";
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
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireWorkspace(req);
    if (!auth.ok) return auth.res;
    const { workspaceId, userId, db } = auth;

    const body = await req.json() as {
      subject?:   string;
      message?:   string;
      category?:  string;
      priority?:  string;
    };
    const { subject, message, category, priority } = body;

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "subject and message are required" }, { status: 400 });
    }

    const cat = category ?? "general";
    const pri = priority ?? "medium";

    const { data, error } = await db
      .from("support_tickets")
      .insert({
        workspace_id: workspaceId,
        user_id:      userId,
        subject:      subject.trim(),
        message:      message.trim(),
        category:     cat,
        priority:     pri,
      })
      .select("id, ticket_number, subject, message, category, priority, status, admin_reply, admin_replied_at, created_at, updated_at")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Failed to create ticket" }, { status: 500 });

    // Insert the initial message into ticket_messages for thread continuity
    const insertMsg = await db.from("ticket_messages").insert({
      ticket_id:   data.id,
      sender_type: "user",
      user_id:     userId,
      message:     message.trim(),
    }).select("id, sender_type, message, created_at").single();
    const firstMessage = insertMsg.data ?? null;

    // Notify admin (fire-and-forget — don't block the response)
    (async () => {
      try {
        const adminDb = createAdminClient();
        const [
          { data: setting },
          { data: authData },
        ] = await Promise.all([
          adminDb.from("admin_settings").select("value").eq("key", "support_email").single(),
          adminDb.auth.admin.getUserById(userId),
        ]);
        const adminEmail = (setting?.value as string) ?? "";
        const ticketUser = authData?.user ?? null;
        if (adminEmail && ticketUser?.email) {
          await sendAdminNewTicketNotification({
            adminEmail,
            ticketNumber: data.ticket_number,
            subject:      data.subject,
            message:      message.trim(),
            userEmail:    ticketUser.email,
            category:     cat,
            priority:     pri,
            ticketId:     data.id,
          });
        }
      } catch (e) { console.error("[support/tickets notify]", e); }
    })();

    return NextResponse.json(
      { ...data, messages: firstMessage ? [firstMessage] : [] },
      { status: 201 },
    );
  } catch (err) {
    console.error("[support/tickets POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
