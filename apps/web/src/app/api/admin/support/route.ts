import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendAdminCreatedTicketNotification, sendAdminNewTicketNotification } from "@/lib/email/notifications";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page     = parseInt(searchParams.get("page")     ?? "1");
  const status   = searchParams.get("status")   ?? "";
  const priority = searchParams.get("priority") ?? "";
  const search   = searchParams.get("search")   ?? "";
  const perPage  = 30;

  let query = ctx.adminClient
    .from("support_tickets")
    .select("id, ticket_number, subject, message, category, priority, status, admin_reply, admin_replied_at, created_at, updated_at, user_id, workspace_id", { count: "exact" })
    .order("created_at", { ascending: false });

  if (status)   query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (search)   query = query.ilike("subject", `%${search}%`);

  const { data: tickets, count, error } = await query
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Ticket = { id: string; user_id: string; [k: string]: unknown };

  // Enrich with user emails
  const rows = (tickets ?? []) as Ticket[];
  const userIds = [...new Set(rows.map(t => t.user_id))];
  const emailMap = new Map<string, string>();
  if (userIds.length) {
    const { data: { users } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });
    users.forEach((u: { id: string; email?: string }) => emailMap.set(u.id, u.email ?? ""));
  }

  const enriched = rows.map(t => ({
    ...t,
    user_email: emailMap.get(t.user_id) ?? "",
  }));

  return NextResponse.json({ tickets: enriched, total: count ?? 0, page, perPage });
}

// POST /api/admin/support — create a ticket on behalf of a user
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    user_id:    string;
    subject?:   string;
    message?:   string;
    category?:  string;
    priority?:  string;
  };

  const { user_id, subject, message, category, priority } = body;
  if (!user_id || !subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "user_id, subject, and message are required" }, { status: 400 });
  }

  // Fetch the target user's workspace membership to get a workspace_id
  const { data: membership } = await ctx.adminClient
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user_id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "User has no workspace" }, { status: 400 });
  }

  const cat = category ?? "general";
  const pri = priority ?? "medium";

  const { data: ticket, error } = await ctx.adminClient
    .from("support_tickets")
    .insert({
      workspace_id: membership.workspace_id,
      user_id,
      subject:  subject.trim(),
      message:  message.trim(),
      category: cat,
      priority: pri,
    })
    .select("id, ticket_number, subject, message, category, priority, status, created_at")
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: error?.message ?? "Failed to create ticket" }, { status: 500 });
  }

  // Insert opening message in thread
  await ctx.adminClient.from("ticket_messages").insert({
    ticket_id:   ticket.id,
    sender_type: "admin",
    user_id:     ctx.user.id,
    message:     message.trim(),
  });

  // Emails (fire-and-forget)
  (async () => {
    try {
      const [
        { data: { user: targetUser } },
        { data: supportSetting },
      ] = await Promise.all([
        ctx.adminClient.auth.admin.getUserById(user_id),
        ctx.adminClient.from("admin_settings").select("value").eq("key", "support_email").single(),
      ]);
      const supportEmail = (supportSetting?.value as string | undefined) ?? "support@leadash.com";

      // Email to the user
      if (targetUser?.email) {
        await sendAdminCreatedTicketNotification({
          userEmail:    targetUser.email,
          ticketNumber: ticket.ticket_number,
          subject:      ticket.subject,
          message:      message.trim(),
          supportEmail,
          ticketId:     ticket.id,
        });
      }

      // Notify all admins
      const { data: admins } = await ctx.adminClient
        .from("admins")
        .select("user_id");
      if (admins?.length) {
        const adminIds = admins.map((a: { user_id: string }) => a.user_id);
        const { data: { users: adminUsers } } = await ctx.adminClient.auth.admin.listUsers({ perPage: 1000 });
        const adminEmails = adminUsers
          .filter((u: { id: string }) => adminIds.includes(u.id))
          .map((u: { email?: string }) => u.email)
          .filter(Boolean) as string[];

        for (const adminEmail of adminEmails) {
          await sendAdminNewTicketNotification({
            adminEmail,
            ticketNumber: ticket.ticket_number,
            subject:      ticket.subject,
            message:      message.trim(),
            userEmail:    targetUser?.email ?? "unknown",
            category:     cat,
            priority:     pri,
            ticketId:     ticket.id,
          }).catch(() => null);
        }
      }
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({ ok: true, ticket });
}
