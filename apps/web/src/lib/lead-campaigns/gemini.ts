// ─── Gemini AI personalization ────────────────────────────────────────────────

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL       = "gemini-1.5-flash";

interface LeadData {
  first_name?: string | null;
  last_name?:  string | null;
  title?:      string | null;
  company?:    string | null;
  industry?:   string | null;
  website?:    string | null;
}

// Generates personalized opening lines for a batch of leads.
// Returns array in same order as input leads.
export async function personalizeLeads(
  leads:         LeadData[],
  productPrompt: string,
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const BATCH = 20;
  const results: string[] = [];

  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH);
    const lines = await Promise.all(batch.map(lead => personalizeSingle(apiKey, lead, productPrompt)));
    results.push(...lines);
  }
  return results;
}

async function personalizeSingle(
  apiKey:        string,
  lead:          LeadData,
  productPrompt: string,
): Promise<string> {
  const name    = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "the recipient";
  const context = [
    lead.title && `${lead.title}`,
    lead.company && `at ${lead.company}`,
    lead.industry && `(${lead.industry})`,
  ].filter(Boolean).join(" ");

  const prompt = `You are a cold email expert. Write a single personalized opening line (max 20 words, no quotes, no ellipsis) for an email to ${name}${context ? `, ${context}` : ""}. The email is about: ${productPrompt}. Be specific, natural, and avoid generic phrases. Respond with only the opening line.`;

  const res = await fetch(`${GEMINI_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 80, temperature: 0.8 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text.trim().replace(/^["']|["']$/g, "");
}
