import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/extension-auth";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a professional LinkedIn engagement expert. Generate a single, high-quality LinkedIn comment for the given post.

Guidelines:
- Be authentic and add genuine value to the conversation
- Keep it concise: 1-3 sentences (50-120 words max)
- Match the specified tone
- Do NOT use clichés like "Great post!", "Absolutely!", "This is so true!"
- Do NOT use hashtags or @mentions
- Do NOT add a disclaimer or explain what you are doing
- Return ONLY the comment text — no quotes, no explanation, no label`;

type Tone = "professional" | "casual" | "insightful" | "curious" | "supportive";

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  professional: "Use a professional, authoritative tone. Share a relevant insight or perspective.",
  casual: "Use a friendly, conversational tone as if chatting with a colleague.",
  insightful: "Provide a thought-provoking observation or unique angle on the topic.",
  curious: "Ask a genuine, open-ended question that invites further conversation.",
  supportive: "Offer encouragement and acknowledge the value of what was shared.",
};

export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (!auth.ok) return auth.res;

  let body: { post_text?: string; tone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const postText = body.post_text?.trim();
  if (!postText) {
    return NextResponse.json({ error: "post_text is required" }, { status: 400 });
  }

  const tone = (body.tone ?? "professional") as Tone;
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS.professional;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Tone instruction: ${toneInstruction}\n\nLinkedIn post:\n${postText}`,
        },
      ],
    });

    const comment =
      message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("")
        .trim() ?? "";

    if (!comment) {
      return NextResponse.json({ error: "Failed to generate comment" }, { status: 500 });
    }

    return NextResponse.json({ comment });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extension/ai-comment]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
