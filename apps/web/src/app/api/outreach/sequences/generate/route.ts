import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured (set OPENAI_API_KEY)" }, { status: 503 });

  const { product_name, target_audience, value_prop, tone = "professional", num_emails = 3, wait_days_between = 3 } = await req.json();
  if (!product_name || !target_audience) {
    return NextResponse.json({ error: "product_name and target_audience are required" }, { status: 400 });
  }

  const prompt = `You are an expert cold email copywriter. Generate a ${num_emails}-email outreach sequence.

Product/Service: ${product_name}
Target audience: ${target_audience}
Value proposition: ${value_prop || "not specified"}
Tone: ${tone}
Days between emails: ${wait_days_between}

Rules:
- Each email should be short, focused, and build on the previous one
- Email 1: Cold intro — hook + value prop, end with a soft CTA
- Email 2: Follow-up — new angle or social proof, brief
- Email 3+: Final nudge — shorter, different perspective or case study
- Subject lines should be punchy and under 8 words
- Bodies: conversational, no fluff, 3-5 sentences max
- Use {{first_name}}, {{company}}, {{title}} as personalization variables where natural
- No generic openers like "I hope this finds you well"

Respond with JSON only in this exact format:
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

The first step should have wait_days: 0. Subsequent steps should have wait_days: ${wait_days_between}.`;

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
