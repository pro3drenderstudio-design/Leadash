// ─── Gemini AI personalization ────────────────────────────────────────────────

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Use the stable flash model — gemini-2.5-flash requires specific API key tiers.
// Upgrade to gemini-2.5-flash-preview-04-17 once key supports it.
const MODEL       = "gemini-1.5-flash";

interface LeadData {
  first_name?: string | null;
  last_name?:  string | null;
  title?:      string | null;
  company?:    string | null;
  industry?:   string | null;
  website?:    string | null;
}

// Generates personalized content for a batch of leads.
// standard = icebreaker opening line (1-2 sentences)
// deep     = full personalized cold email body (no subject, no signature)
// Returns array in same order as input leads.
export async function personalizeLeads(
  leads:         LeadData[],
  productPrompt: string,
  depth:         "standard" | "deep" = "standard",
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const BATCH = 20;
  const results: string[] = [];

  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH);
    const lines = await Promise.all(batch.map(lead => personalizeSingle(apiKey, lead, productPrompt, depth)));
    results.push(...lines);
  }
  return results;
}

async function personalizeSingle(
  apiKey:        string,
  lead:          LeadData,
  productPrompt: string,
  depth:         "standard" | "deep",
): Promise<string> {
  const name    = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "there";
  const context = [
    lead.title,
    lead.company && `at ${lead.company}`,
    lead.industry && `(${lead.industry} industry)`,
  ].filter(Boolean).join(" ");

  let prompt: string;
  let maxTokens: number;

  if (depth === "deep") {
    prompt = `You are an expert cold email copywriter. Write a complete, highly personalized cold email body for the following prospect.

Prospect: ${name}${context ? `, ${context}` : ""}
Offer/Product: ${productPrompt}

Rules:
- 3-4 short paragraphs, conversational tone, no fluff
- Reference their specific role, company, or industry naturally
- Clear value proposition and one soft CTA at the end
- Do NOT include a subject line
- Do NOT include a greeting like "Hi [name]" at the start
- Do NOT include a sign-off or signature at the end
- Do NOT use generic openers like "I hope this finds you well"
- No placeholders — write the full body ready to drop into a sequence
- Keep it under 120 words
- Respond with ONLY the email body, nothing else`;
    maxTokens = 400;
  } else {
    prompt = `You are a cold email expert. Write a single personalized icebreaker opening line (1-2 sentences, max 30 words) for a cold email to ${name}${context ? `, ${context}` : ""}.

The email is about: ${productPrompt}

Rules:
- Reference something specific about their role, company, or industry
- Sound natural and human, not salesy
- No generic openers like "I came across your profile"
- Do NOT include a greeting like "Hi [name]" — just the icebreaker line
- Respond with ONLY the icebreaker line, no quotes, no ellipsis`;
    maxTokens = 120;
  }

  const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.9 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text.trim().replace(/^["']|["']$/g, "");
}
