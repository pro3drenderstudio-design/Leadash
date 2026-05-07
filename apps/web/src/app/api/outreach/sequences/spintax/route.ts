import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const { text, field = "body" } = await req.json() as { text: string; field?: "subject" | "body" };
  if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const fieldGuide = field === "subject"
    ? "This is an email SUBJECT LINE. Keep each variation concise (under 10 words). Generate 3–4 variants per spintax group."
    : "This is an email BODY. Add spintax to openers, CTAs, and key phrases. Keep the overall message coherent across all combinations.";

  const prompt = `Rewrite the following email ${field} using spintax format.

Spintax syntax: {option A|option B|option C}
- Each {…} group contains 2–4 equally valid variations separated by |
- Keep {{first_name}}, {{company}}, {{title}} and other {{variables}} unchanged — do NOT wrap them in spintax
- ${fieldGuide}
- Preserve all newlines and paragraph structure in the body
- Do not add spintax to every word — only add variety where it sounds natural and improves deliverability

Input:
${text}

Respond with JSON only:
{"spintax": "<rewritten text with spintax>"}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an email deliverability expert specializing in spintax. Respond with JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      let detail = "";
      try { const e = await res.json(); detail = e?.error?.message ?? ""; } catch { /* ignore */ }
      return NextResponse.json({ error: `OpenAI error ${res.status}${detail ? `: ${detail}` : ""}` }, { status: 500 });
    }

    const data   = await res.json();
    const text2  = (data?.choices?.[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(text2);

    if (!parsed.spintax) return NextResponse.json({ error: "No spintax generated" }, { status: 500 });
    return NextResponse.json({ spintax: parsed.spintax });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
