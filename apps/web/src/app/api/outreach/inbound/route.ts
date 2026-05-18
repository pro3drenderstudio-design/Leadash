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
import { aiClassify, detectOoo } from "@/lib/outreach/ai-classify";

// DSN (Delivery Status Notification) bounce detection
const DSN_FROM_PATTERNS = [
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^mail-daemon@/i,
  /^noreply@/i,
  /^bounce\d*@rp\./i,       // Postal return-path bounce addresses (bounce1@rp.postal.*)
  /^bounce\d*@/i,            // Generic bounce return-paths
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
  try {
    return await handleInbound(req);
  } catch (err) {
    console.error("[inbound] unhandled error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleInbound(req: NextRequest) {
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

  // Postal sends rcpt_to/mail_from (clean SMTP envelope addresses) and
  // to/from (header values that include display names, e.g. "John <john@co.com>").
  // Always prefer the clean envelope fields; fall back to extracting from header.
  function extractEmail(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const m = raw.match(/<([^>]+)>/);
    return (m ? m[1] : raw).trim().toLowerCase() || undefined;
  }
  function extractName(raw: string | undefined): string | null {
    if (!raw) return null;
    const m = raw.match(/^(.+?)\s*<[^>]+>/);
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  }

  // rcpt_to (envelope) gives the clean recipient address without display names.
  // For the sender, use the From: header — mail_from is Postal's return-path
  // (e.g. bounce1@rp.postal.leadash.com) and is not the actual sender address.
  const to      = extractEmail((body.rcpt_to   ?? body.to)   as string | undefined);
  const from    = extractEmail((body.from      ?? body.mail_from) as string | undefined);
  const fromName = extractName(body.from as string | undefined) ?? (body.from_name as string | undefined)?.trim() ?? null;
  const subject  = (body.subject     as string | undefined)?.trim() ?? "";
  const text        = ((body.text ?? body.plain_body) as string | undefined)?.trim() ?? "";
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

  // ── Parse referenced message-ids early (needed for workspace resolution) ────────
  const stripBrackets = (id: string) => id.replace(/^<|>$/g, "").trim();
  const referencedIds: string[] = [];
  if (inReplyTo) referencedIds.push(stripBrackets(inReplyTo));
  if (references) {
    const refs = references.match(/<[^>]+>/g) ?? [];
    referencedIds.push(...refs.map(stripBrackets));
  }

  // ── Resolve workspace — may be via inbox or by matching referenced sends ──────
  // When inbox is null (e.g. auto-reply sent to return-path bounce address), try to
  // find the workspace from In-Reply-To / References before giving up.
  let workspaceId: string;
  let inboxId: string | null = null;

  if (inbox) {
    workspaceId = inbox.workspace_id as string;
    inboxId     = inbox.id as string;
  } else {
    let derivedWorkspace: string | null = null;

    if (referencedIds.length > 0) {
      const { data: refSend } = await db
        .from("outreach_sends")
        .select("workspace_id")
        .in("message_id", referencedIds)
        .limit(1)
        .maybeSingle();
      if (refSend) derivedWorkspace = refSend.workspace_id as string;
    }

    if (!derivedWorkspace && from) {
      const { data: senderSend } = await db
        .from("outreach_sends")
        .select("workspace_id")
        .ilike("to_email", from)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (senderSend) derivedWorkspace = senderSend.workspace_id as string;
    }

    if (!derivedWorkspace) {
      // Truly unknown — could be catch-all receiving unrelated mail
      return NextResponse.json({ ok: true, note: "inbox not found" });
    }

    workspaceId = derivedWorkspace;
    console.log(`[inbound] no inbox for ${to}, resolved workspace ${workspaceId} via send match`);
  }

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
  const isFiltered = detectOoo(subject, text);

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

  // Fallback: match by sender email → most recent sent email to that address.
  // Handles replies where the mail client strips In-Reply-To / References headers.
  if (!enrollmentId && from) {
    const { data: bySender } = await db
      .from("outreach_sends")
      .select("id, enrollment_id")
      .eq("workspace_id", workspaceId)
      .ilike("to_email", from)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bySender) {
      enrollmentId  = bySender.enrollment_id as string;
      matchedSendId = bySender.id            as string;
    }
  }

  // ── Warmup detection ──────────────────────────────────────────────────────────
  let isWarmup = false;

  if (!enrollmentId) {
    // Check if sender is any known inbox in the platform — including previously
    // warmup-enabled inboxes that have since been disabled. Cross-workspace.
    const { data: senderInbox } = await db
      .from("outreach_inboxes")
      .select("id")
      .ilike("email_address", from)
      .limit(1)
      .maybeSingle();

    if (senderInbox) {
      isWarmup = true;
    } else if (referencedIds.length > 0) {
      const { data: warmupSend } = await db
        .from("outreach_warmup_sends")
        .select("id")
        .in("message_id", referencedIds)
        .limit(1)
        .maybeSingle();

      if (warmupSend) isWarmup = true;
    }
  }

  // ── AI classify (skip for warmup and filtered) ───────────────────────────────
  let aiCategory = "neutral", aiConfidence = 0;
  if (!isFiltered && !isWarmup) {
    const r = await aiClassify(subject, text);
    aiCategory   = r.category;
    aiConfidence = r.confidence;
  }

  // ── Store reply ───────────────────────────────────────────────────────────────
  // Return 500 on insert failure so Postal retries delivery — avoids silently
  // dropping a reply while leaving the enrollment in a stale state.
  const { error: replyErr } = await db.from("outreach_replies").insert({
    workspace_id:  workspaceId,
    inbox_id:      inboxId,
    send_id:       matchedSendId,
    enrollment_id: enrollmentId,
    from_email:    from,
    from_name:     fromName,
    subject,
    body_text:     text,
    message_id:    messageId,
    in_reply_to:   inReplyTo,
    received_at:   receivedAt,
    is_filtered:   isFiltered,
    is_warmup:     isWarmup,
    ai_category:   aiCategory,
    ai_confidence: aiConfidence,
  });

  if (replyErr) {
    // Ignore duplicate message_id (idempotent re-delivery by Postal)
    if (replyErr.code === "23505") {
      return NextResponse.json({ ok: true, type: "duplicate" });
    }
    console.error("[inbound] reply insert failed:", replyErr.message);
    return NextResponse.json({ error: "Failed to store reply" }, { status: 500 });
  }

  // ── Update enrollment + send if matched ──────────────────────────────────────
  if (enrollmentId) {
    // Fetch campaign flags (stop_on_reply, stop_on_auto_reply)
    const { data: enrRow } = await db
      .from("outreach_enrollments")
      .select("campaign_id")
      .eq("id", enrollmentId)
      .single();

    let stopOnReply     = true;  // safe default
    let stopOnAutoReply = false; // default: keep going on OOO

    if (enrRow?.campaign_id) {
      const { data: camp } = await db
        .from("outreach_campaigns")
        .select("stop_on_reply, stop_on_auto_reply")
        .eq("id", enrRow.campaign_id)
        .single();
      if (camp) {
        stopOnReply     = camp.stop_on_reply     ?? true;
        stopOnAutoReply = camp.stop_on_auto_reply ?? false;
      }
    }

    // Decide whether to stop the sequence:
    // - Real reply + stop_on_reply → stop
    // - Auto-reply/OOO + stop_on_auto_reply + stop_on_reply → stop
    // - Auto-reply/OOO + !stop_on_auto_reply → keep going (don't update status)
    const shouldStop = !isFiltered
      ? stopOnReply
      : (isFiltered && stopOnAutoReply && stopOnReply);

    // Always record send replied_at (factual event regardless of stop setting)
    if (matchedSendId) {
      await db
        .from("outreach_sends")
        .update({ replied_at: receivedAt })
        .eq("id", matchedSendId);
    }

    if (shouldStop) {
      await db
        .from("outreach_enrollments")
        .update({ crm_status: "replied", status: "replied" })
        .eq("id", enrollmentId)
        .not("crm_status", "in", '("won","lost","not_interested")');
    }

    // Promote crm_status to AI-detected intent if confident and not an OOO
    if (!isFiltered && aiConfidence >= 0.7 && aiCategory !== "neutral") {
      const { data: enr } = await db
        .from("outreach_enrollments")
        .select("crm_status")
        .eq("id", enrollmentId)
        .single();
      if (enr?.crm_status === "neutral" || enr?.crm_status === "replied") {
        await db
          .from("outreach_enrollments")
          .update({ crm_status: aiCategory })
          .eq("id", enrollmentId);
      }
    }
  }

  return NextResponse.json({ ok: true, type: enrollmentId ? "campaign" : isWarmup ? "warmup" : "unmatched" });
}
