import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendUserReplyNotification } from "@/lib/email/notifications";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

// GET /api/admin/support/[ticketId]
export async function GET(_: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { ticketId } = await params;

  const { data: ticket, error } = await ctx.adminClient
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .single();

  if (error || !ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enrich with user + workspace info
  const [
    { data: { user: ticketUser } },
    { data: workspace },
    { data: messages },
  ] = await Promise.all([
    ctx.adminClient.auth.admin.getUserById(ticket.user_id),
    ctx.adminClient.from("workspaces").select("id, name, plan_id").eq("id", ticket.workspace_id).single(),
    ctx.adminClient.from("ticket_messages")
      .select("id, sender_type, message, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
  ]);

  return NextResponse.json({
    ticket,
    messages:       messages ?? [],
    user_email:     ticketUser?.email ?? "",
    workspace_name: workspace?.name  ?? "",
    workspace_plan: workspace?.plan_id ?? "",
  });
}

// PATCH /api/admin/support/[ticketId]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { ticketId } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.admin_reply !== undefined) {
    update.admin_reply       = body.admin_reply;
    update.admin_replied_at  = new Date().toISOString();
    // Auto-advance to in_progress if still open
    if (body.status) {
      update.status = body.status;
    } else {
      const { data: existing } = await ctx.adminClient
        .from("support_tickets").select("status").eq("id", ticketId).single();
      if (existing?.status === "open") update.status = "in_progress";
    }
    if (update.status === "resolved") update.resolved_at = new Date().toISOString();
  }

  if (body.status && body.admin_reply === undefined) {
    update.status = body.status;
    if (body.status === "resolved") update.resolved_at = new Date().toISOString();
  }

  if (body.priority) update.priority = body.priority;

  const { data, error } = await ctx.adminClient
    .from("support_tickets")
    .update(update)
    .eq("id", ticketId)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 400 });

  // If a reply was included, insert into thread + email user
  if (body.admin_reply) {
    await ctx.adminClient.from("ticket_messages").insert({
      ticket_id:   ticketId,
      sender_type: "admin",
      user_id:     ctx.user.id,
      message:     body.admin_reply,
    }).catch(() => null);

    // Fire-and-forget email to user
    (async () => {
      try {
        const [
          { data: { user: ticketUser } },
          { data: supportSetting },
        ] = await Promise.all([
          ctx.adminClient.auth.admin.getUserById(data.user_id),
          ctx.adminClient.from("admin_settings").select("value").eq("key", "support_email").single(),
        ]);
        const userEmail    = ticketUser?.email ?? "";
        const supportEmail = (supportSetting?.value as string) ?? "support@leadash.io";
        if (userEmail) {
          await sendUserReplyNotification({
            userEmail,
            ticketNumber: data.ticket_number,
            subject:      data.subject,
            adminReply:   body.admin_reply,
            supportEmail,
            ticketId:     ticketId,
          });
        }
      } catch { /* non-fatal */ }
    })();
  }

  return NextResponse.json({ ok: true, ticket: data });
}
