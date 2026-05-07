import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const {
    first_email,
    existing_steps = [],
    num_followups = 2,
    wait_days = 3,
    tone = "match",
    length = "shorter",
  } = await req.json() as {
    first_email: { subject: string; body: string };
    existing_steps?: { subject: string; body: string }[];
    num_followups?: number;
    wait_days?: number;
    tone?: string;
    length?: string;
  };

  if (!first_email?.subject && !first_email?.body) {
    return NextResponse.json({ error: "first_email with subject and/or body is required" }, { status: 400 });
  }

  const count = Math.min(Math.max(num_followups, 1), 5);

  const toneGuide: Record<string, string> = {
    match:        "Mirror the tone of the first email exactly.",
    professional: "Professional and polished — formal but not stiff.",
    friendly:     "Warm, conversational, and approachable. Like emailing a colleague.",
    direct:       "Direct and confident. Get to the point fast, no fluff.",
    casual:       "Casual and relaxed — sounds like a real person, not marketing.",
    persuasive:   "Persuasive — build urgency and value without being pushy.",
  };

  const lengthGuide: Record<string, string> = {
    shorter:  "Each follow-up must be shorter than the previous email. Keep trimming.",
    short:    "2–4 sentences maximum per follow-up. Ultra concise.",
    medium:   "5–8 sentences. Enough to make the point without overstaying.",
    long:     "Can be as long as needed to make a compelling case, but no filler.",
    same:     "Match the approximate length of the first email.",
  };

  const existingContext = existing_steps.length > 0
    ? `\n\nThe sequence already has these additional emails after the first:\n${existing_steps.map((s, i) => `Email ${i + 2}:\nSubject: ${s.subject}\nBody: ${s.body}`).join("\n\n")}\n\nGenerate follow-ups that continue AFTER these emails, building on what was already said.`
    : "";

  const angleGuides: Record<number, string> = {
    1: "Short, friendly bump — assume they were busy. Don't re-pitch, just nudge.",
    2: "New angle — introduce a benefit, pain point, or use case not covered in the first email.",
    3: "Social proof or specificity — reference a customer result, a relevant stat, or a specific insight about their industry.",
    4: "Breakup email — very short, acknowledge this is likely your last email, give them an easy out.",
    5: "Final value drop — one last compelling reason or resource, then bow out gracefully.",
  };

  const anglesText = Array.from({ length: count }, (_, i) => `  Follow-up ${i + 1}: ${angleGuides[i + 1] ?? "Natural progression from the previous email, fresh angle."}`).join("\n");

  const prompt = `You are an expert cold email copywriter. A user has written the first email in a cold outreach sequence. Generate exactly ${count} follow-up email${count !== 1 ? "s" : ""} that naturally continue from it.

First email:
Subject: ${first_email.subject || "(no subject)"}
Body:
${first_email.body || "(no body)"}
${existingContext}

Angle guide (follow these in order):
${anglesText}

Tone: ${toneGuide[tone] ?? toneGuide.match}
Length: ${lengthGuide[length] ?? lengthGuide.shorter}

Rules:
- Acknowledge it's a follow-up naturally in the opening, don't be mechanical about it
- Use {{first_name}}, {{company}}, {{title}} where it sounds natural
- Subject lines: short (under 8 words); follow-ups often work as "Re:" or a fresh subject
- No filler phrases like "I hope this email finds you well"
- Never use the exact same opener twice

Respond with JSON only:
{
  "followups": [
    { "subject": "...", "body": "..." }
  ]
}

The array must contain exactly ${count} item${count !== 1 ? "s" : ""}.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a cold email copywriting expert. Respond with JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 3000,
        temperature: 0.75,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      let detail = "";
      try { const e = await res.json(); detail = e?.error?.message ?? ""; } catch { /* ignore */ }
      return NextResponse.json({ error: `OpenAI error ${res.status}${detail ? `: ${detail}` : ""}` }, { status: 500 });
    }

    const data   = await res.json();
    const text   = (data?.choices?.[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed.followups) || !parsed.followups.length) {
      return NextResponse.json({ error: "No follow-ups generated" }, { status: 500 });
    }

    // Interleave wait + email steps
    const steps: { type: "email" | "wait"; wait_days: number; subject: string; body: string }[] = [];
    for (const fu of parsed.followups as { subject: string; body: string }[]) {
      steps.push({ type: "wait",  wait_days, subject: "", body: "" });
      steps.push({ type: "email", wait_days: 0, subject: fu.subject ?? "", body: fu.body ?? "" });
    }

    return NextResponse.json({ steps });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
