import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// POST /api/outreach/crm/[enrollmentId]/suggest
// Uses the conversation context to generate an AI reply suggestion.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { enrollmentId } = await params;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured (set OPENAI_API_KEY)" }, { status: 503 });

  // Fetch enrollment + lead
  const { data: enrollment } = await db
    .from("outreach_enrollments")
    .select("*, lead:outreach_leads!lead_id(id, email, first_name, last_name, company, title), campaign:outreach_campaigns!campaign_id(id, name)")
    .eq("id", enrollmentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lead = enrollment.lead as Record<string, string | null>;
  const campaign = enrollment.campaign as Record<string, string | null> | null;

  // Fetch last few sends + the latest reply for context
  const [sendsRes, repliesRes] = await Promise.all([
    db.from("outreach_sends")
      .select("subject, body, sent_at")
      .eq("enrollment_id", enrollmentId)
      .order("sent_at", { ascending: false })
      .limit(3),
    db.from("outreach_replies")
      .select("from_name, from_email, subject, body_text, received_at")
      .eq("enrollment_id", enrollmentId)
      .eq("is_filtered", false)
      .order("received_at", { ascending: false })
      .limit(3),
  ]);

  const sends = (sendsRes.data ?? []).reverse();
  const replies = (repliesRes.data ?? []).reverse();

  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || "the prospect";
  const context = [
    `Lead: ${leadName}${lead.company ? ` at ${lead.company}` : ""}${lead.title ? ` (${lead.title})` : ""}`,
    campaign ? `Campaign: ${campaign.name}` : "",
    "",
    "--- Conversation History ---",
    ...sends.map((s: Record<string, string | null>) => `[You sent]\nSubject: ${s.subject}\n${s.body ?? ""}`),
    ...replies.map((r: Record<string, string | null>) => `[${r.from_name || r.from_email} replied]\n${r.body_text ?? "(no body)"}`),
  ].filter(Boolean).join("\n\n");

  const prompt = `You are a professional sales assistant. Based on the conversation below:
1. Write a concise, natural reply body (no subject line, greeting prefix, or signature).
2. Suggest the best CRM next-action status from: interested, meeting_booked, follow_up, not_interested.
3. Provide a one-sentence reason for your status suggestion.

Respond ONLY with valid JSON in this exact format:
{"suggestion":"<reply body>","next_action":"<status>","action_reason":"<reason>"}

${context}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a professional sales assistant. Respond only with valid JSON containing suggestion, next_action, and action_reason fields. The suggestion should be a concise reply body with no subject line, greeting, or signature." },
          { role: "user", content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      let detail = "";
      try { const e = await res.json(); detail = e?.error?.message ?? ""; } catch { /* ignore */ }
      return NextResponse.json({ error: `OpenAI error ${res.status}${detail ? `: ${detail}` : ""}` }, { status: 500 });
    }
    const data = await res.json();
    const raw = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (!raw) return NextResponse.json({ error: "No suggestion generated" }, { status: 500 });

    // Try to parse JSON response
    let suggestion = raw;
    let next_action: string | undefined;
    let action_reason: string | undefined;
    try {
      // Extract JSON even if the model wraps it in markdown code fences
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { suggestion?: string; next_action?: string; action_reason?: string };
        suggestion    = parsed.suggestion    ?? raw;
        next_action   = parsed.next_action   ?? undefined;
        action_reason = parsed.action_reason ?? undefined;
      }
    } catch { /* fall back to raw text as suggestion */ }

    return NextResponse.json({ suggestion, next_action, action_reason });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
