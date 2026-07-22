import Anthropic from "@anthropic-ai/sdk";
import { INDUSTRY_OPTIONS, COMPANY_SIZE_OPTIONS } from "@/types/discover";

// AI assistant for the Playbook — suggests complete ICPs and irresistible
// offers so newbies don't start from a blank form. Outputs are constrained to
// the Discover vocabulary (industries, size ranges, common job titles) so a
// finished ICP maps directly onto a Discover search.

const MODEL = "claude-sonnet-4-6";

// Titles that reliably exist in the Discover people data — the model picks
// from (or stays close to) these so "Find leads" searches actually hit.
const COMMON_TITLES = [
  "Founder", "Co-Founder", "CEO", "Managing Director", "General Manager", "Owner",
  "President", "Partner", "Director", "Operations Manager", "COO",
  "Marketing Manager", "Marketing Director", "CMO", "Head of Marketing",
  "Sales Manager", "Sales Director", "Head of Sales", "Business Development Manager",
  "HR Manager", "Head of HR", "CTO", "IT Manager", "Product Manager",
  "Finance Manager", "CFO", "Project Manager", "Principal",
];

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

function toolInput<T>(res: Anthropic.Message, toolName: string): T {
  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === toolName) return block.input as T;
  }
  throw new Error("AI did not return a structured result — please try again.");
}

// ─── ICP suggestion ───────────────────────────────────────────────────────────

export interface IcpSuggestion {
  name:         string;
  industry:     string;
  company_size: string;
  geography:    string;
  roles:        string;
  pains:        string[];
  goals:        string[];
  triggers:     string[];
  objections:   string[];
  tone:         string;
}

const ICP_TOOL: Anthropic.Tool = {
  name: "record_icp",
  description: "Record the suggested ideal customer profile.",
  input_schema: {
    type: "object",
    properties: {
      name:         { type: "string", description: "Short memorable ICP name, e.g. 'Lagos real-estate agency owners'" },
      industry:     { type: "string", enum: [...INDUSTRY_OPTIONS], description: "Must be one of the allowed industries" },
      company_size: { type: "string", description: `One or two ranges from: ${COMPANY_SIZE_OPTIONS.join(", ")} — e.g. "11-50" or "11-50, 51-200"` },
      geography:    { type: "string", description: "Country/region, e.g. 'Nigeria', 'United States', 'UK & Europe'" },
      roles:        { type: "string", description: "2-4 comma-separated job titles of the decision makers, picked from common real-world titles" },
      pains:        { type: "array", items: { type: "string" }, description: "4-5 specific pain points, each a short punchy sentence" },
      goals:        { type: "array", items: { type: "string" }, description: "3-4 concrete goals they want, each short and measurable where possible" },
      triggers:     { type: "array", items: { type: "string" }, description: "3-4 buying-trigger events that make them ready to buy now" },
      objections:   { type: "array", items: { type: "string" }, description: "3-4 likely objections to pre-empt in follow-ups" },
      tone:         { type: "string", description: "1-2 sentences of voice guidance for outreach copy to this audience" },
    },
    required: ["name", "industry", "company_size", "geography", "roles", "pains", "goals", "triggers", "objections", "tone"],
  },
};

export async function suggestIcp(params: {
  industry:      string;
  service:       string;
  geography?:    string;
  company_size?: string;
}): Promise<IcpSuggestion> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a B2B cold-outreach strategist who builds ideal customer profiles (ICPs) for freelancers and agencies — many of them beginners in Nigeria and Africa selling to local or international clients.
Given the seller's target industry and the service they offer, produce ONE sharp, specific ICP for the decision makers most likely to buy that service.
Rules:
- The ICP must be specific enough to write personal cold emails from — no generic filler like "wants to grow revenue".
- Pains, goals, triggers and objections must be written from the BUYER's point of view, in their own words, grounded in that industry's day-to-day reality.
- roles: choose titles close to these common ones so lead searches return results: ${COMMON_TITLES.join(", ")}.
- If the seller gave a geography or company size, respect it; otherwise choose the most commercially sensible one for the service.
Always call the record_icp tool with your answer.`,
    messages: [{
      role: "user",
      content: `Target industry: ${params.industry}
Service I offer: ${params.service}${params.geography ? `\nTarget geography: ${params.geography}` : ""}${params.company_size ? `\nTarget company size: ${params.company_size}` : ""}`,
    }],
    tools: [ICP_TOOL],
    tool_choice: { type: "tool", name: "record_icp" },
  });

  return toolInput<IcpSuggestion>(res, "record_icp");
}

// ─── Offer suggestions ────────────────────────────────────────────────────────

export interface OfferSuggestion {
  name:        string;
  angle:       string;
  what:        string;
  value_prop:  string;
  proof:       string;
  guarantee:   string;
  price_label: string;
  cta_kind:    "book_call" | "reply" | "link";
  cta_label:   string;
}

const OFFERS_TOOL: Anthropic.Tool = {
  name: "record_offers",
  description: "Record the list of suggested offers.",
  input_schema: {
    type: "object",
    properties: {
      offers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name:        { type: "string", description: "Short internal name for the offer, e.g. 'Free teardown → retainer'" },
            angle:       { type: "string", description: "The framework behind it in 3-6 words, e.g. 'Value-first free audit'" },
            what:        { type: "string", description: "What it is, one line, e.g. 'Done-for-you cold outreach system'" },
            value_prop:  { type: "string", description: "One irresistible sentence: specific outcome + timeframe + risk reversal where natural" },
            proof:       { type: "string", description: "What proof to lead with (or how to earn it fast if they have none yet)" },
            guarantee:   { type: "string", description: "A concrete risk-reversal guarantee, or empty string if the angle doesn't need one" },
            price_label: { type: "string", description: "Suggested pricing/packaging label, e.g. '₦250,000/mo' or 'Free, then $500/mo'" },
            cta_kind:    { type: "string", enum: ["book_call", "reply", "link"], description: "Best CTA type for this angle" },
            cta_label:   { type: "string", description: "The exact low-friction CTA line for the email" },
          },
          required: ["name", "angle", "what", "value_prop", "proof", "guarantee", "price_label", "cta_kind", "cta_label"],
        },
      },
    },
    required: ["offers"],
  },
};

export async function suggestOffers(params: {
  service:    string;
  priceHint?: string;
  icp: {
    name:         string;
    industry:     string | null;
    company_size: string | null;
    geography:    string | null;
    roles:        string | null;
    pains:        string[];
    goals:        string[];
    objections:   string[];
  };
}): Promise<OfferSuggestion[]> {
  const { icp } = params;
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `You are a world-class offer strategist (think Alex Hormozi's value equation: dream outcome × likelihood, divided by time delay × effort). You craft irresistible cold-outreach offers for freelancers and agencies, many of them beginners without testimonials yet.
Produce EXACTLY 10 distinct offers for the given service and ICP. Spread them across different proven angles — include at least:
- 2 value-first / free-work angles (free audit, teardown, sample delivered before any ask)
- 2 risk-reversal angles (pay-after-results, money-back, performance guarantee)
- 1 done-for-you productized angle with clear scope
- 1 speed/urgency angle (specific fast timeframe)
- 1 niche-authority angle (positioning as THE specialist for this exact ICP)
- 1 low-ticket foot-in-the-door angle that upsells later
Rules:
- Every value_prop names a specific, believable outcome the ICP cares about — tie it to their stated pains/goals. Never vague ("grow your business").
- For beginners without proof: the proof field should say how to create proof fast (portfolio piece, free pilot results, personal results) rather than inventing fake testimonials.
- Never fabricate case studies, client names, or numbers as if they already happened.
- CTAs must be low-friction and match the angle (a free-audit offer asks for a reply, not a 60-min call).
- Respect the seller's price hint if given; otherwise price realistically for the ICP's market and geography.
Always call the record_offers tool with exactly 10 offers.`,
    messages: [{
      role: "user",
      content: `My service/skillset: ${params.service}${params.priceHint ? `\nMy pricing thoughts: ${params.priceHint}` : ""}

Target ICP: ${icp.name}
Industry: ${icp.industry ?? "—"}
Company size: ${icp.company_size ?? "—"}
Geography: ${icp.geography ?? "—"}
Decision makers: ${icp.roles ?? "—"}
Their pains: ${icp.pains.length ? icp.pains.join("; ") : "—"}
Their goals: ${icp.goals.length ? icp.goals.join("; ") : "—"}
Their objections: ${icp.objections.length ? icp.objections.join("; ") : "—"}`,
    }],
    tools: [OFFERS_TOOL],
    tool_choice: { type: "tool", name: "record_offers" },
  });

  return toolInput<{ offers: OfferSuggestion[] }>(res, "record_offers").offers ?? [];
}
