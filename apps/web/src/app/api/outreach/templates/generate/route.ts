import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured (set OPENAI_API_KEY)" }, { status: 503 });

  const { prompt: userPrompt, tone = "professional" } = await req.json();
  if (!userPrompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const systemPrompt = `You are an expert cold email copywriter. Generate a complete email template based on the user's description.

Rules:
- Write a punchy subject line (under 8 words)
- Body: 3-4 short paragraphs, ${tone} tone, conversational, no fluff
- Use {{first_name}}, {{last_name}}, {{company}}, {{title}} for personalization
- End with one clear CTA
- No generic openers like "I hope this finds you well"
- No signature or sign-off (user will add their own)
- Under 150 words for the body

Respond with JSON only:
{
  "subject": "...",
  "body": "..."
}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.85,
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

    if (!parsed.subject || !parsed.body) {
      return NextResponse.json({ error: "AI returned incomplete template" }, { status: 500 });
    }

    return NextResponse.json({ subject: parsed.subject, body: parsed.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
