import Anthropic from "@anthropic-ai/sdk";

// ─── Models ───────────────────────────────────────────────────────────────────

export const AI_PROSPECT_MODELS = {
  "claude-haiku-4-5-20251001": { label: "Haiku",  description: "Fast · best for major industries",      credits: 3 },
  "claude-sonnet-4-6":         { label: "Sonnet", description: "Balanced · regional & mid-size niches", credits: 5 },
  "claude-opus-4-8":           { label: "Opus",   description: "Deep recall · obscure niches",          credits: 9 },
} as const;

export type AiProspectModel = keyof typeof AI_PROSPECT_MODELS;

export function creditRateForModel(model: AiProspectModel): number {
  return AI_PROSPECT_MODELS[model]?.credits ?? 3;
}

// ─── Tool schema ──────────────────────────────────────────────────────────────

const RECORD_TOOL: Anthropic.Tool = {
  name: "record_prospects",
  description: "Record the list of decision makers you found.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            person_name:         { type: "string", description: "Full name" },
            title:               { type: "string", description: "Job title" },
            company_name:        { type: "string", description: "Company name" },
            domain:              { type: "string", description: "Company website domain (e.g. acme.com)" },
            linkedin_url:        { type: "string", description: "LinkedIn profile URL if known" },
            ai_email:            { type: "string", description: "Guessed email (firstname.lastname@domain pattern)" },
            ai_email_confidence: { type: "number", description: "0-100: how confident you are in the email format" },
            notes:               { type: "string", description: "One short sentence about why this person matters" },
          },
          required: ["person_name", "title", "company_name", "domain", "ai_email", "ai_email_confidence"],
        },
      },
    },
    required: ["results"],
  },
};

// ─── Prompt builder ───────────────────────────────────────────────────────────

export interface ProspectQuery {
  industry:     string;
  role:         string;
  geography:    string;
  company_size: string;
  count:        number;
  model:        AiProspectModel;
}

export interface ProspectResult {
  person_name:         string;
  title:               string;
  company_name:        string;
  domain:              string;
  linkedin_url:        string | null;
  ai_email:            string;
  ai_email_confidence: number;
  notes:               string | null;
}

export async function generateProspects(query: ProspectQuery): Promise<ProspectResult[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic({ apiKey });

  const sizeHint = query.company_size !== "any"
    ? ` Company size: ${query.company_size} employees.`
    : "";

  const res = await client.messages.create({
    model: query.model,
    max_tokens: 4096,
    system: `You are a B2B lead researcher with deep knowledge of business executives worldwide.
Use only real companies and real executives from your training data.
Generate first.last@domain pattern email guesses — set ai_email_confidence lower (15-40) when
you are less certain of the person's exact email format or if they may have left the role.
Do not invent companies. Vary seniority slightly (CEO, President, Managing Director, VP, etc.).
Always call the record_prospects tool with your findings.`,
    messages: [
      {
        role: "user",
        content: `Find ${query.count} ${query.role} decision makers at ${query.industry} companies in ${query.geography}.${sizeHint}
Return a diverse mix — different company sizes, sub-niches, and geographies within the region where possible.`,
      },
    ],
    tools: [RECORD_TOOL],
    tool_choice: { type: "any" },
  });

  // Extract the tool call result
  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === "record_prospects") {
      const input = block.input as { results: ProspectResult[] };
      return (input.results ?? []).map(r => ({
        person_name:         String(r.person_name ?? "").trim(),
        title:               String(r.title ?? "").trim(),
        company_name:        String(r.company_name ?? "").trim(),
        domain:              String(r.domain ?? "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
        linkedin_url:        r.linkedin_url ? String(r.linkedin_url).trim() : null,
        ai_email:            String(r.ai_email ?? "").toLowerCase().trim(),
        ai_email_confidence: Math.max(0, Math.min(100, Number(r.ai_email_confidence) || 30)),
        notes:               r.notes ? String(r.notes).trim() : null,
      })).filter(r => r.person_name && r.company_name && r.domain && r.ai_email);
    }
  }

  return [];
}
