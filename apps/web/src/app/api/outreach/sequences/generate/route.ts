import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured (set OPENAI_API_KEY)" }, { status: 503 });

  const { product_name, target_audience, value_prop, tone = "professional", num_emails = 3, wait_days_between = 3, message_length = "standard" } = await req.json();
  if (!product_name || !target_audience) {
    return NextResponse.json({ error: "product_name and target_audience are required" }, { status: 400 });
  }

  const lengthGuide: Record<string, string> = {
    concise:       "2–3 sentences per email — ultra-short, every word earns its place",
    standard:      "4–5 sentences per email — clear and scannable",
    detailed:      "6–8 sentences per email — room for context and a compelling story",
    comprehensive: "9–12 sentences per email — thorough, covers objections and proof points",
  };
  const bodyGuide = lengthGuide[message_length] ?? lengthGuide.standard;

  const prompt = `You are an expert cold email copywriter. Generate EXACTLY ${num_emails} emails for an outreach sequence. No more, no less — the "steps" array MUST contain exactly ${num_emails} objects.

Product/Service: ${product_name}
Target audience: ${target_audience}
Value proposition: ${value_prop || "not specified"}
Tone: ${tone}
Message length: ${bodyGuide}
Days between emails: ${wait_days_between}

Rules:
- Each email builds on the previous one with a fresh angle
- Email 1: Cold intro — hook + value prop, soft CTA
- Email 2: Follow-up — new angle or social proof
- Email 3: Different perspective or case study
- Email 4+: Shorter nudge, create urgency or try a completely different hook
- Subject lines: punchy, under 8 words
- Respect the message length guideline strictly
- Use {{first_name}}, {{company}}, {{title}} as personalization variables where natural
- No generic openers like "I hope this finds you well"

Respond with JSON only in this exact format (the steps array must have exactly ${num_emails} items):
{
  "steps": [
    {
      "type": "email",
      "wait_days": 0,
      "subject": "...",
      "body": "..."
    }
  ]
}

The first step must have wait_days: 0. All subsequent steps must have wait_days: ${wait_days_between}.`;

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
        max_tokens: 2000,
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      let detail = "";
      try { const e = await res.json(); detail = e?.error?.message ?? ""; } catch { /* ignore */ }
      return NextResponse.json({ error: `OpenAI error ${res.status}${detail ? `: ${detail}` : ""}` }, { status: 500 });
    }

    const data  = await res.json();
    const text  = (data?.choices?.[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed.steps) || !parsed.steps.length) {
      return NextResponse.json({ error: "No steps generated" }, { status: 500 });
    }

    return NextResponse.json({ steps: parsed.steps });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
