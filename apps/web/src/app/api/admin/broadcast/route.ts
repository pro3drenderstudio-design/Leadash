/**
 * POST /api/admin/broadcast
 *
 * Admin-only endpoint to send a broadcast email to all users (or a subset).
 * Body: { subject, html, text, filter?: "all" | "active" }
 *
 * Sends in batches of 50 with a small delay to stay within Resend rate limits.
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
    preview?: boolean; // dry-run: just return recipient count
  };

  const { subject, html, text, filter = "all", preview = false } = body;

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
    // Only users who have at least one workspace (have onboarded)
    const { data: wsRows } = await admin
      .from("workspaces")
      .select("owner_id")
      .not("owner_id", "is", null);
    const activeIds = new Set((wsRows ?? []).map((r: { owner_id: string }) => r.owner_id));
    recipients = recipients.filter((r: Recipient) => activeIds.has(r.id));
  }

  if (preview) {
    return NextResponse.json({ count: recipients.length, sample: recipients.slice(0, 5).map(r => r.email) });
  }

  // Send in batches of 50
  const BATCH = 50;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);

    await Promise.all(batch.map(async r => {
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
          sent++;
        }
      } catch (e) {
        errors.push(`${r.email}: ${String(e)}`);
        failed++;
      }
    }));

    // Respect Resend rate limits (100 req/s on paid, be conservative)
    if (i + BATCH < recipients.length) await sleep(600);
  }

  return NextResponse.json({
    total: recipients.length,
    sent,
    failed,
    errors: errors.slice(0, 20), // cap error list
  });
}
