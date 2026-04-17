/**
 * POST /api/support/inbound
 *
 * Inbound email webhook for support ticket replies.
 * Parses email replies and threads them into the correct ticket.
 *
 * To enable email-to-ticket replies:
 *   1. Configure your email provider (Resend/Postmark/Mailgun) to forward inbound
 *      emails sent to  support+ticket-{ID}@yourdomain.com  to this endpoint.
 *   2. Set SUPPORT_INBOUND_SECRET env var and pass it as ?secret=... on the
 *      webhook URL so only your email provider can POST here.
 *
 * Works with Resend's inbound webhooks payload format.
 * The "to" address encodes the ticket ID: support+ticket-UUID@domain.com
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendUserReplyNotification } from "@/lib/email/notifications";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

// Extract ticket ID from addresses like: support+ticket-UUID@domain.com
function extractTicketId(addresses: string | string[]): string | null {
  const list = Array.isArray(addresses) ? addresses : [addresses];
  for (const addr of list) {
    const m = addr.match(/\+ticket-([0-9a-f-]{36})/i);
    if (m) return m[1];
  }
  return null;
}

// Strip quoted reply content (lines starting with ">") to keep message clean
function stripQuotedReply(text: string): string {
  return text
    .split("\n")
    .filter(line => !line.trim().startsWith(">"))
    .join("\n")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  // Optional secret verification
  const secret = process.env.SUPPORT_INBOUND_SECRET;
  if (secret) {
    const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract fields — handles both Resend and generic webhook formats
  const to   = (payload.to   ?? payload.ToFull ?? payload.recipients ?? "") as string | string[];
  const from = (payload.from ?? payload.From   ?? payload.sender     ?? "") as string;
  const subject = (payload.subject ?? payload.Subject ?? "") as string;
  const textBody = (payload.text  ?? payload.TextBody ?? payload.body_text ?? "") as string;

  const ticketId = extractTicketId(to);
  if (!ticketId) {
    return NextResponse.json({ ok: true, type: "no_ticket_id" });
  }

  const db = createAdminClient();

  // Fetch ticket
  const { data: ticket, error } = await db
    .from("support_tickets")
    .select("id, ticket_number, subject, status, user_id, workspace_id")
    .eq("id", ticketId)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ ok: true, type: "ticket_not_found" });
  }

  if (ticket.status === "closed") {
    return NextResponse.json({ ok: true, type: "ticket_closed" });
  }

  // Resolve sender: is this a known user (user reply) or unknown (admin/external)?
  const senderEmail = from.replace(/^.*<|>$/g, "").trim().toLowerCase();
  const { data: { user: sender } } = await db.auth.admin.getUserByEmail(senderEmail).catch(() => ({ data: { user: null } }));
  const isUser = !!sender;
  const senderId = sender?.id ?? ticket.user_id;

  const cleanMessage = stripQuotedReply(textBody) || subject;
  if (!cleanMessage.trim()) {
    return NextResponse.json({ ok: true, type: "empty_message" });
  }

  // Insert message into thread
  await db.from("ticket_messages").insert({
    ticket_id:   ticketId,
    sender_type: isUser ? "user" : "admin",
    user_id:     senderId,
    message:     cleanMessage,
  });

  // Update ticket status if closed/resolved → reopen
  if (isUser && (ticket.status === "resolved")) {
    await db.from("support_tickets")
      .update({ status: "open", updated_at: new Date().toISOString() })
      .eq("id", ticketId);
  }

  // If this was a user reply, notify all admins
  if (isUser) {
    try {
      const { data: adminsData } = await db.from("admins").select("user_id");
      const { data: supportSetting } = await db.from("admin_settings").select("value").eq("key", "support_email").single();
      const supportEmail = (supportSetting?.value as string | undefined) ?? "support@leadash.com";

      if (adminsData?.length) {
        const adminIds = adminsData.map((a: { user_id: string }) => a.user_id);
        const { data: { users: adminUsers } } = await db.auth.admin.listUsers({ perPage: 1000 });
        const adminEmails = adminUsers
          .filter((u: { id: string }) => adminIds.includes(u.id))
          .map((u: { email?: string }) => u.email)
          .filter(Boolean) as string[];

        for (const adminEmail of adminEmails) {
          await fetch(`${APP_URL}/api/admin/support/${ticketId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
          }).catch(() => null);
          // Just notify via email directly
          await sendUserReplyNotification({
            userEmail:    adminEmail,
            ticketNumber: ticket.ticket_number,
            subject:      ticket.subject,
            adminReply:   `User replied via email:\n\n${cleanMessage}`,
            supportEmail,
            ticketId:     ticket.id,
          }).catch(() => null);
        }
      }
    } catch { /* non-fatal */ }
  }

  console.log(`[support/inbound] ticket=${ticketId} from=${senderEmail} type=${isUser ? "user" : "admin"}`);
  return NextResponse.json({ ok: true, ticketId, type: isUser ? "user_reply" : "admin_reply" });
}
