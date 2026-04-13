// ─── OpenAI GPT personalization ───────────────────────────────────────────────

const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";
const MODEL       = "gpt-4o-mini";

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

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

  let systemPrompt: string;
  let userPrompt:   string;
  let maxTokens:    number;

  if (depth === "deep") {
    systemPrompt = "You are an expert cold email copywriter. Write complete, highly personalized cold email bodies. Never use placeholders. Output only the email body — no subject line, no greeting, no sign-off.";
    userPrompt   = `Write a personalized cold email body for this prospect.

Prospect: ${name}${context ? `, ${context}` : ""}
Offer: ${productPrompt}

Rules:
- 3-4 short paragraphs, conversational tone, no fluff
- Reference their specific role, company, or industry naturally
- Clear value proposition and one soft CTA at the end
- No subject line, no greeting like "Hi [name]", no sign-off
- No generic openers like "I hope this finds you well"
- Under 120 words`;
    maxTokens = 400;
  } else {
    systemPrompt = "You are a cold email expert. Write single personalized icebreaker opening lines. Output only the line — no quotes, no greeting, nothing else.";
    userPrompt   = `Write a personalized icebreaker opening line (1-2 sentences, max 30 words) for a cold email to ${name}${context ? `, ${context}` : ""}.

The email is about: ${productPrompt}

Rules:
- Reference something specific about their role, company, or industry
- Sound natural and human, not salesy
- No generic openers like "I came across your profile"
- Do NOT start with "Hi [name]" — just the icebreaker line`;
    maxTokens = 120;
  }

  const res = await fetch(OPENAI_BASE, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       MODEL,
      messages:    [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      max_tokens:  maxTokens,
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try { const e = await res.json(); detail = e?.error?.message ?? JSON.stringify(e); } catch { /* ignore */ }
    throw new Error(`OpenAI API error ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return text.trim().replace(/^["']|["']$/g, "");
}
