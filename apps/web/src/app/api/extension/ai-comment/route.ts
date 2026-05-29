import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/extension-auth";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

type Tone   = "professional" | "casual" | "insightful" | "curious" | "supportive";
type Length = "short" | "medium" | "long";

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional: "Use a professional, authoritative tone. Share a relevant insight or perspective.",
  casual:       "Use a friendly, conversational tone as if chatting with a colleague.",
  insightful:   "Provide a thought-provoking observation or unique angle on the topic.",
  curious:      "Ask a genuine, open-ended question that invites further conversation.",
  supportive:   "Offer encouragement and acknowledge the value of what was shared.",
};

const LENGTH_INSTRUCTIONS: Record<Length, string> = {
  short:  "Write 1-2 sentences, around 20-40 words.",
  medium: "Write 2-3 sentences, around 40-80 words.",
  long:   "Write 3-5 sentences, around 80-120 words.",
};

interface Persona {
  name?:     string;
  headline?: string;
  offer?:    string;
  audience?: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  let body: { post_text?: string; tone?: string; length?: string; persona?: Persona };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const postText = body.post_text?.trim();
  if (!postText) return NextResponse.json({ error: "post_text is required" }, { status: 400 });

  // Check + deduct 1 credit
  const { data: ws } = await db
    .from("workspaces")
    .select("lead_credits_balance, subscription_credits_balance")
    .eq("id", workspaceId)
    .single();

  if (!ws || (ws.lead_credits_balance ?? 0) < 1) {
    return NextResponse.json(
      { error: "Insufficient credits. Purchase more from Leadash Settings → Billing." },
      { status: 402 }
    );
  }

  const newSub     = Math.max(0, (ws.subscription_credits_balance ?? 0) - 1);
  const newBalance = (ws.lead_credits_balance ?? 0) - 1;

  await db.from("workspaces").update({
    lead_credits_balance:         newBalance,
    subscription_credits_balance: newSub,
  }).eq("id", workspaceId);

  await db.from("lead_credit_transactions").insert({
    workspace_id: workspaceId,
    amount:       -1,
    type:         "consume",
    description:  "AI LinkedIn comment",
  });

  // Build persona context block
  const persona   = body.persona ?? {};
  const tone      = (body.tone   ?? "professional") as Tone;
  const length    = (body.length ?? "medium")       as Length;

  const personaLines: string[] = [];
  if (persona.name)     personaLines.push(`Your name: ${persona.name}`);
  if (persona.headline) personaLines.push(`Your headline: ${persona.headline}`);
  if (persona.offer)    personaLines.push(`Your value prop: ${persona.offer}`);
  if (persona.audience) personaLines.push(`Your target audience: ${persona.audience}`);

  const personaBlock = personaLines.length
    ? `\n\nContext about who is writing this comment:\n${personaLines.join("\n")}`
    : "";

  const systemPrompt = `You are a professional LinkedIn engagement expert. Generate a single, high-quality LinkedIn comment for the given post.

Guidelines:
- Be authentic and add genuine value to the conversation
- ${LENGTH_INSTRUCTIONS[length] ?? LENGTH_INSTRUCTIONS.medium}
- Match the specified tone
- If persona context is given, subtly reflect that perspective — but do NOT mention the commenter's name, company, or offer directly unless it flows naturally
- Do NOT use clichés like "Great post!", "Absolutely!", "This is so true!"
- Do NOT use hashtags or @mentions
- Do NOT add a disclaimer or explain what you are doing
- Return ONLY the comment text — no quotes, no labels${personaBlock}`;

  try {
    const message = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:     systemPrompt,
      messages: [{
        role:    "user",
        content: `Tone: ${TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS.professional}\n\nLinkedIn post:\n${postText}`,
      }],
    });

    const comment = message.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    if (!comment) return NextResponse.json({ error: "Failed to generate comment" }, { status: 500 });

    return NextResponse.json({ comment, credits_remaining: newBalance });
  } catch (err) {
    // Refund the credit on AI failure
    await db.from("workspaces").update({ lead_credits_balance: ws.lead_credits_balance }).eq("id", workspaceId);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extension/ai-comment]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
