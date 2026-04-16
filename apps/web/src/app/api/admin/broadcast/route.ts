/**
 * POST /api/admin/broadcast
 *
 * Admin-only endpoint to send a broadcast email to all users (or a subset).
 * Body: { subject, html, text, filter?, preview?, limit?, offset? }
 *
 * Sends sequentially with a 210 ms gap (≈4.8/s) to stay under Resend's 5/s limit.
 * Use `limit` + `offset` to send in pages across multiple calls.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const FROM = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.io";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!data) return null;
  return { user, admin };
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  const body = await req.json() as {
    subject?: string;
    html?: string;
    text?: string;
    filter?: "all" | "active";
    preview?: boolean;
    limit?: number;   // max recipients to send to in this call
    offset?: number;  // start from this index (for paging)
  };

  const { subject, html, text, filter = "all", preview = false, limit, offset = 0 } = body;

  if (!preview && (!subject || !html || !text)) {
    return NextResponse.json({ error: "subject, html and text are required" }, { status: 400 });
  }

  // Fetch all auth users via admin client
  const { admin } = ctx;
  const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type AuthUser = (typeof users)[number];
  type Recipient = { id: string; email: string };
  let recipients: Recipient[] = (users ?? [])
    .filter((u: AuthUser) => !!u.email && u.email_confirmed_at)
    .map((u: AuthUser) => ({ id: u.id, email: u.email! }));

  if (filter === "active") {
    const { data: wsRows } = await admin
      .from("workspaces")
      .select("owner_id")
      .not("owner_id", "is", null);
    const activeIds = new Set((wsRows ?? []).map((r: { owner_id: string }) => r.owner_id));
    recipients = recipients.filter((r: Recipient) => activeIds.has(r.id));
  }

  const total = recipients.length;

  // Apply offset + limit for paged sending
  const page = recipients.slice(offset, limit ? offset + limit : undefined);

  if (preview) {
    return NextResponse.json({
      count: total,
      page_count: page.length,
      offset,
      sample: recipients.slice(0, 5).map(r => r.email),
    });
  }

  // Send sequentially — 210 ms between each (≈4.8/s, under Resend's 5/s limit)
  const DELAY_MS = 210;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const succeeded: string[] = [];

  for (let i = 0; i < page.length; i++) {
    const r = page[i];
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `Leadash <${FROM}>`,
          to: [r.email],
          subject,
          html,
          text,
        }),
      });
      if (!res.ok) {
        const b = await res.text();
        errors.push(`${r.email}: ${res.status} ${b}`);
        failed++;
      } else {
        succeeded.push(r.email);
        sent++;
      }
    } catch (e) {
      errors.push(`${r.email}: ${String(e)}`);
      failed++;
    }

    // Rate-limit gap between sends (skip after last one)
    if (i < page.length - 1) await sleep(DELAY_MS);
  }

  return NextResponse.json({
    total,           // total matching recipients
    page_count: page.length,  // how many were attempted this run
    offset,
    next_offset: offset + page.length < total ? offset + page.length : null,
    sent,
    failed,
    succeeded,
    errors: errors.slice(0, 50),
  });
}
