/**
 * POST /api/outreach/inbound
 *
 * Receives inbound emails forwarded by the Postal agent.
 * Authenticated with the same x-agent-secret used for agent calls.
 *
 * Expected JSON body from the agent:
 * {
 *   to:          "user@domain.com",
 *   from:        "sender@example.com",
 *   from_name:   "Sender Name",       // optional
 *   subject:     "Re: ...",
 *   text:        "plain text body",
 *   html:        "<div>...</div>",     // optional
 *   message_id:  "<abc@mail.example>",
 *   in_reply_to: "<original-id>",     // optional
 *   references:  "<id1> <id2>",       // optional
 *   x_ld_ref:    "warmup-uuid",       // optional — present on warmup emails
 *   received_at: "2026-04-16T...",    // optional, defaults to now
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const AUTO_REPLY_PATTERNS = [
  /^auto[- ]?reply/i,
  /^out of office/i,
  /^automatic reply/i,
  /^autom.*reply/i,
  /^vacation/i,
  /^absence/i,
];

// DSN (Delivery Status Notification) bounce detection
const DSN_FROM_PATTERNS = [
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^mail-daemon@/i,
  /^noreply@/i,
];
const DSN_SUBJECT_PATTERNS = [
  /delivery.status.notification/i,
  /mail delivery failed/i,
  /undeliverable/i,
  /delivery failure/i,
  /failed delivery/i,
  /delivery.*failed/i,
  /returned mail/i,
  /message not delivered/i,
  /could not be delivered/i,
];

function isAutoReply(subject: string): boolean {
  return AUTO_REPLY_PATTERNS.some(p => p.test(subject));
}

function isDsnBounce(from: string, subject: string): boolean {
  return (
    DSN_FROM_PATTERNS.some(p => p.test(from)) ||
    DSN_SUBJECT_PATTERNS.some(p => p.test(subject))
  );
}

/**
 * Extract the bounced recipient email address from a DSN notification body.
 * Handles the most common DSN body formats used by major MTAs.
 */
function extractBouncedEmail(text: string): string | null {
  const patterns = [
    // RFC 3464 machine-readable DSN: "Final-Recipient: rfc822; user@domain.com"
    /Final-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i,
    // Common human-readable formats
    /The following address(?:es)? failed:\s*\n?\s*([^\s<>]+@[^\s<>]+)/i,
    /could not be delivered to:\s*([^\s<>]+@[^\s<>]+)/i,
    /message.*?could not.*?delivered.*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
    /Original-Recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/i,
    // Angle-bracket wrapped: <user@domain.com>
    /delivery.*?<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const email = match[1].trim().toLowerCase().replace(/[<>]/g, "");
      if (email.includes("@")) return email;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  // Auth
  const secret = req.headers.get("x-agent-secret");
  if (!secret || secret !== process.env.POSTAL_AGENT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const to          = (body.to         as string | undefined)?.trim().toLowerCase();
  const from        = (body.from        as string | undefined)?.trim().toLowerCase();
  const fromName    = (body.from_name   as string | undefined)?.trim() ?? null;
  const subject     = (body.subject     as string | undefined)?.trim() ?? "";
  const text        = (body.text        as string | undefined)?.trim() ?? "";
  const messageId   = (body.message_id  as string | undefined)?.trim() ?? null;
  const inReplyTo   = (body.in_reply_to as string | undefined)?.trim() ?? null;
  const references  = (body.references  as string | undefined)?.trim() ?? null;
  const xLdRef      = (body.x_ld_ref   as string | undefined)?.trim() ?? null;
  const receivedAt  = (body.received_at as string | undefined) ?? new Date().toISOString();

  if (!to || !from) {
    return NextResponse.json({ error: "to and from are required" }, { status: 400 });
  }

  const db = createAdminClient();

  // ── Find the inbox this was sent to ──────────────────────────────────────────
  const { data: inbox } = await db
    .from("outreach_inboxes")
    .select("id, workspace_id")
    .eq("email_address", to)
    .maybeSingle();

  // ── DSN bounce notification — handle before inbox lookup ─────────────────────
  // Bounce-back emails arrive addressed TO our sending inbox (the original From:).
  // We detect them by sender/subject, extract the original recipient, and suppress them.
  if (to && from && isDsnBounce(from, subject)) {
    const bouncedEmail = extractBouncedEmail(text);
    if (bouncedEmail) {
      // Suppress the bounced address globally
      await db.from("email_suppressions").upsert(
        { email: bouncedEmail, reason: "hard_bounce" },
        { onConflict: "email", ignoreDuplicates: true },
      );

      // Mark the lead bounced across all workspaces that have this email
      await db
        .from("outreach_leads")
        .update({ status: "bounced" })
        .eq("email", bouncedEmail)
        .neq("status", "bounced");

      // Mark any active enrollment for this lead as bounced
      const { data: bouncedLeads } = await db
        .from("outreach_leads")
        .select("id")
        .eq("email", bouncedEmail);

      if (bouncedLeads?.length) {
        const leadIds = bouncedLeads.map((l: { id: string }) => l.id);
        await db
          .from("outreach_enrollments")
          .update({ status: "bounced" })
          .in("lead_id", leadIds)
          .in("status", ["active", "paused"]);

        // Mark the most recent queued/sent send record as bounced
        await db
          .from("outreach_sends")
          .update({ status: "bounced", bounced_at: new Date().toISOString() })
          .in("lead_id", leadIds)
          .in("status", ["queued", "sent"]);
      }

      console.log(`[inbound] DSN bounce processed: ${bouncedEmail} suppressed globally`);
      return NextResponse.json({ ok: true, type: "dsn_bounce", bounced: bouncedEmail });
    }

    // DSN detected but couldn't parse recipient — log and drop
    console.warn(`[inbound] DSN bounce from ${from} but could not extract bounced address. Subject: ${subject}`);
    return NextResponse.json({ ok: true, type: "dsn_unresolved" });
  }

  if (!inbox) {
    // Unknown address — ignore silently (could be catch-all receiving unrelated mail)
    return NextResponse.json({ ok: true, note: "inbox not found" });
  }

  const workspaceId = inbox.workspace_id as string;

  // ── Warmup reply: update outreach_warmup_sends ────────────────────────────────
  if (xLdRef) {
    await db
      .from("outreach_warmup_sends")
      .update({ replied_at: receivedAt })
      .eq("id", xLdRef)
      .is("replied_at", null);
    return NextResponse.json({ ok: true, type: "warmup" });
  }

  // ── Campaign reply: match via In-Reply-To / References ────────────────────────
  const isFiltered = isAutoReply(subject);

  // Collect all message-ids from In-Reply-To and References headers
  const referencedIds: string[] = [];
  if (inReplyTo) referencedIds.push(inReplyTo);
  if (references) {
    const refs = references.match(/<[^>]+>/g) ?? [];
    referencedIds.push(...refs);
  }

  let enrollmentId: string | null = null;
  let matchedSendId: string | null = null;

  if (referencedIds.length > 0) {
    const { data: matchedSend } = await db
      .from("outreach_sends")
      .select("id, enrollment_id")
      .in("message_id", referencedIds)
      .eq("workspace_id", workspaceId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (matchedSend) {
      enrollmentId  = matchedSend.enrollment_id as string;
      matchedSendId = matchedSend.id            as string;
    }
  }

  // ── Store reply ───────────────────────────────────────────────────────────────
  await db.from("outreach_replies").insert({
    workspace_id:  workspaceId,
    inbox_id:      inbox.id,
    enrollment_id: enrollmentId,
    from_email:    from,
    from_name:     fromName,
    subject,
    body_text:     text,
    message_id:    messageId,
    received_at:   receivedAt,
    is_filtered:   isFiltered,
    ai_category:   null,
    ai_confidence: null,
  });

  // ── Update enrollment + send if matched ──────────────────────────────────────
  if (enrollmentId && !isFiltered) {
    await db
      .from("outreach_enrollments")
      .update({ crm_status: "replied", status: "replied" })
      .eq("id", enrollmentId)
      .not("crm_status", "in", '("won","lost","not_interested")');

    if (matchedSendId) {
      await db
        .from("outreach_sends")
        .update({ replied_at: receivedAt })
        .eq("id", matchedSendId);
    }
  }

  return NextResponse.json({ ok: true, type: enrollmentId ? "campaign" : "unmatched" });
}
