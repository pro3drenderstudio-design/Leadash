const OOO_PATTERNS = [
  /out of (the )?office/i, /on vacation/i, /away from (the )?office/i,
  /automatic(ally)? reply/i, /auto.?reply/i, /i('m| am) currently (away|out|unavailable)/i,
  /will be (back|returning)/i, /on (annual|maternity|paternity|sick) leave/i,
  /currently (out|away|travelling)/i, /this is an automated/i, /do not reply to this (email|message)/i,
];

export function detectOoo(subject?: string | null, body?: string | null): boolean {
  const text = `${subject ?? ""} ${body ?? ""}`;
  return OOO_PATTERNS.some(p => p.test(text));
}

const VALID_CATEGORIES = new Set([
  "interested", "meeting_booked", "not_interested", "ooo", "follow_up", "neutral",
]);

export async function aiClassify(
  subject: string | null,
  bodyText: string | null,
): Promise<{ category: string; confidence: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { category: "neutral", confidence: 0 };

  const snippet = (bodyText ?? "").slice(0, 500).replace(/\s+/g, " ");
  const prompt = `Classify this cold email reply into one category.
Categories: interested, meeting_booked, not_interested, ooo, follow_up, neutral
Subject: ${subject ?? "(none)"}
Body: ${snippet}
Respond with JSON only: {"category": "...", "confidence": 0.0-1.0}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an email classification assistant. Respond with JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 60,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return { category: "neutral", confidence: 0 };
    const data   = await res.json();
    const text   = (data?.choices?.[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(text);
    const category   = VALID_CATEGORIES.has(parsed.category) ? parsed.category : "neutral";
    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;
    return { category, confidence };
  } catch { return { category: "neutral", confidence: 0 }; }
}
