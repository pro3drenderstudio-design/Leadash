import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const { subject, body, issues } = await req.json() as {
    subject: string;
    body:    string;
    issues?: string[];
  };

  if (!body?.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const issueList = issues?.length
    ? `\n\nSpam issues to fix:\n${issues.map(i => `- ${i}`).join("\n")}`
    : "";

  const completion = await openai.chat.completions.create({
    model:           "gpt-4o-mini",
    temperature:     0.7,
    response_format: { type: "json_object" },
    messages: [
      {
        role:    "system",
        content: [
          "You are an email deliverability expert who rewrites cold outreach emails to pass spam filters.",
          "Rules:",
          "- Preserve the message intent, tone, and structure",
          "- Keep all {{variable}} placeholders exactly as-is",
          "- Fix all identified spam triggers",
          "- Keep the same approximate length",
          "- Never add disclaimers, introductions, or meta-commentary",
          "- Return ONLY valid JSON: { \"subject\": \"...\", \"body\": \"...\" }",
        ].join("\n"),
      },
      {
        role:    "user",
        content: `Rewrite this cold outreach email to avoid spam filters.${issueList}\n\nSubject: ${subject}\n\nBody:\n${body}`,
      },
    ],
  });

  let result: { subject?: string; body?: string } = {};
  try {
    result = JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 });
  }

  return NextResponse.json({
    subject: result.subject ?? subject,
    body:    result.body    ?? body,
  });
}
