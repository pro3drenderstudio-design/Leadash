/**
 * POST /api/admin/crm/ai-suggest  { conversation_id }
 *
 * Suggest-mode CRM agent. Drafts the next reply for an inbound WhatsApp/email
 * conversation — the human still reviews and sends. Grounded on:
 *   - a curated facts block (default + admin_settings.crm_ai_agent override),
 *   - the contact's LIVE status (signup / payment / cohort) from the DB,
 *   - real past replies our team has sent (so it matches our voice + policies,
 *     e.g. the guarantee), and
 *   - the current conversation transcript.
 *
 * It never confirms payments or invents policy — it escalates instead.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalisePhoneNG } from "@/lib/phone";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5";

interface AdminAuth { db: ReturnType<typeof createAdminClient>; }

async function requireAdmin(): Promise<AdminAuth | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db } : null;
}

function truncate(s: string, n: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI is not configured (missing ANTHROPIC_API_KEY)." }, { status: 503 });
  }
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;

  let body: { conversation_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const conversationId = body.conversation_id;
  if (!conversationId) return NextResponse.json({ error: "conversation_id required" }, { status: 400 });

  // ── Conversation + contact ────────────────────────────────────────────────
  const { data: convo } = await db
    .from("crm_conversations")
    .select("id, channel, crm_contacts ( id, email, whatsapp_number, display_name )")
    .eq("id", conversationId)
    .single();
  if (!convo) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  const rawContact = convo.crm_contacts as unknown;
  const contact = ((Array.isArray(rawContact) ? rawContact[0] : rawContact) ?? {}) as { id?: string; email?: string | null; whatsapp_number?: string | null; display_name?: string | null };
  const firstName = (contact.display_name ?? "").trim().split(" ")[0] || "there";

  // ── This conversation's transcript (chronological, no notes) ──────────────
  const { data: msgs } = await db
    .from("crm_messages")
    .select("direction, body, created_at")
    .eq("conversation_id", conversationId)
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(24);
  const transcript = ((msgs ?? []) as Array<{ direction: string; body: string | null }>)
    .filter(m => m.body && !m.body.startsWith("[NOTE]"))
    .reverse()
    .map(m => `${m.direction === "inbound" ? "Contact" : "Us"}: ${truncate(m.body!, 600)}`)
    .join("\n");

  // ── Live status for this contact (grounds dates/payment — never guessed) ──
  let statusBlock = "This person is not matched to a challenge signup yet.";
  const phoneNorm = normalisePhoneNG(contact.whatsapp_number ?? null);
  let signup: { status?: string; amount_ngn?: number | null; user_id?: string | null } | null = null;
  if (contact.email || phoneNorm) {
    const { data: s } = await db
      .from("challenge_signups")
      .select("status, amount_ngn, user_id, full_name")
      .or([
        contact.email ? `email.eq.${contact.email}` : "",
        phoneNorm ? `phone.eq.${phoneNorm}` : "",
      ].filter(Boolean).join(","))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    signup = s;
  }
  if (signup) {
    if (signup.status === "confirmed") {
      // Resolve their cohort go-live for an exact "when does it start" answer.
      let cohortWhen: string | null = null;
      if (signup.user_id) {
        const { data: enr } = await db
          .from("academy_enrollments")
          .select("academy_cohorts ( starts_at )")
          .eq("user_id", signup.user_id)
          .eq("product_id", (await db.from("academy_products").select("id").eq("slug", "challenge-7day").single()).data?.id ?? "")
          .maybeSingle();
        const startsAt = (enr?.academy_cohorts as { starts_at?: string } | null)?.starts_at ?? null;
        if (startsAt) cohortWhen = new Date(startsAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }) + " WAT";
      }
      statusBlock = `Payment CONFIRMED. They already have access. Their cohort goes live: ${cohortWhen ?? "date not set yet"} — that is when Day 1 unlocks.`;
    } else if (signup.status === "pending") {
      statusBlock = `Signed up but payment is PENDING/being verified (₦${(signup.amount_ngn ?? 10000).toLocaleString()}). They should message us to confirm their bank transfer; a human verifies it. Do NOT tell them they're confirmed.`;
    } else {
      statusBlock = `Signup status: ${signup.status}.`;
    }
  }

  // ── How our team actually replies (voice + policies e.g. the guarantee) ───
  const { data: examples } = await db
    .from("crm_messages")
    .select("body, conversation_id")
    .eq("direction", "outbound")
    .eq("channel", "whatsapp")
    .is("template_name", null)
    .not("body", "is", null)
    .neq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(60);
  const seen = new Set<string>();
  const exampleReplies = ((examples ?? []) as Array<{ body: string | null }>)
    .map(e => (e.body ?? "").trim())
    .filter(b => b.length > 25 && !b.startsWith("[NOTE]"))
    .filter(b => { const k = b.slice(0, 40).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 18)
    .map(b => `- ${truncate(b, 400)}`)
    .join("\n");

  // ── Curated facts (default + admin override) ──────────────────────────────
  const { data: priceRow } = await db.from("admin_settings").select("value").eq("key", "funnel_challenge_price").maybeSingle();
  const price = typeof priceRow?.value === "number" ? priceRow.value : (typeof priceRow?.value === "string" ? parseInt(priceRow.value, 10) || 10000 : 10000);
  const { data: cfgRow } = await db.from("admin_settings").select("value").eq("key", "crm_ai_agent").maybeSingle();
  let override: { persona?: string; facts?: string } = {};
  try { const raw = cfgRow?.value; if (typeof raw === "string") override = JSON.parse(raw); else if (raw && typeof raw === "object") override = raw as typeof override; } catch { /* ignore */ }

  const facts = override.facts ?? `
- Product: the 7-Day Job & Client Acquisition Challenge — a daily accountability sprint that helps Nigerian professionals/freelancers land foreign clients and earn in dollars.
- Price: ₦${price.toLocaleString()}, paid by bank transfer or Paystack.
- After paying, the person must message us on WhatsApp so we can VERIFY the payment. A human verifies it — the AI never confirms payment.
- Once payment is verified, they get: access to the private WhatsApp group + their Leadash Academy dashboard (leadash.com/academy).
- Cohorts are weekly. A confirmed person joins the current cohort, which goes live (Day 1) on a Monday at 9:00 PM WAT. Use the contact's exact cohort date from the status block when asked — never guess a date.`;

  const persona = override.persona ?? "You are the friendly, sharp support agent for Leadash Academy, replying on WhatsApp to people interested in or enrolled in the 7-Day Challenge. Audience is Nigerian. Keep it warm, human, and concise — WhatsApp style, short paragraphs, no corporate stiffness, no walls of text.";

  const system = `${persona}

## Facts you may rely on (do NOT contradict or go beyond these):
${facts}

## This contact's live status (authoritative — use this, don't guess):
${statusBlock}

## How our team actually replies to prospects (mirror this voice AND these policies — e.g. the guarantee, objection handling — do not invent your own):
${exampleReplies || "(no past examples available)"}

## Rules:
- Reply as "us" (the business), addressing ${firstName} warmly. One concise message.
- Only use the facts above and the style/policies shown in the team examples. If a question needs a fact you don't have (specific guarantee terms, refunds, a promise, anything financial, or anything you're unsure about), DO NOT invent it.
- You must NEVER tell someone their payment is confirmed — only a human does that. If they say they've paid, thank them, ask for the transfer name/amount if not given, and tell them we're verifying it.
- If the message needs a human (payment verification, refund, complaint, edge case, or you're unsure), reply with EXACTLY "[[ESCALATE]]" followed by a one-line reason — nothing else.
- No emojis-only replies; a tasteful emoji is fine. Never mention you are an AI.`;

  const userMsg = `Recent WhatsApp conversation (oldest first, most recent last):
${transcript || "(no prior messages)"}

Draft the single next message we should send to ${firstName}.`;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = message.content.filter(b => b.type === "text").map(b => (b as { type: "text"; text: string }).text).join("").trim();

    if (text.startsWith("[[ESCALATE]]")) {
      return NextResponse.json({ escalate: true, reason: text.replace("[[ESCALATE]]", "").trim() || "Needs a human." });
    }
    return NextResponse.json({ escalate: false, suggestion: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[crm/ai-suggest]", msg);
    return NextResponse.json({ error: "AI suggestion failed. Try again." }, { status: 500 });
  }
}
