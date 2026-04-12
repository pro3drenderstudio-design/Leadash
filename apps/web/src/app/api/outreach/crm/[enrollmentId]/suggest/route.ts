import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// POST /api/outreach/crm/[enrollmentId]/suggest
// Uses the conversation context to generate an AI reply suggestion.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ enrollmentId: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { enrollmentId } = await params;

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured (set GEMINI_API_KEY)" }, { status: 503 });

  // Fetch enrollment + lead
  const { data: enrollment } = await db
    .from("outreach_enrollments")
    .select("*, lead:outreach_leads!lead_id(id, email, first_name, last_name, company, title), campaign:outreach_campaigns!campaign_id(id, name)")
    .eq("id", enrollmentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!enrollment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lead = enrollment.lead as Record<string, string | null>;
  const campaign = enrollment.campaign as Record<string, string | null> | null;

  // Fetch last few sends + the latest reply for context
  const [sendsRes, repliesRes] = await Promise.all([
    db.from("outreach_sends")
      .select("subject, body, sent_at")
      .eq("enrollment_id", enrollmentId)
      .order("sent_at", { ascending: false })
      .limit(3),
    db.from("outreach_replies")
      .select("from_name, from_email, subject, body_text, received_at")
      .eq("enrollment_id", enrollmentId)
      .eq("is_filtered", false)
      .order("received_at", { ascending: false })
      .limit(3),
  ]);

  const sends = (sendsRes.data ?? []).reverse();
  const replies = (repliesRes.data ?? []).reverse();

  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || "the prospect";
  const context = [
    `Lead: ${leadName}${lead.company ? ` at ${lead.company}` : ""}${lead.title ? ` (${lead.title})` : ""}`,
    campaign ? `Campaign: ${campaign.name}` : "",
    "",
    "--- Conversation History ---",
    ...sends.map((s: Record<string, string | null>) => `[You sent]\nSubject: ${s.subject}\n${s.body ?? ""}`),
    ...replies.map((r: Record<string, string | null>) => `[${r.from_name || r.from_email} replied]\n${r.body_text ?? "(no body)"}`),
  ].filter(Boolean).join("\n\n");

  const prompt = `You are a professional sales assistant. Based on the conversation below, write a concise, natural reply that continues the conversation in a helpful and professional tone. Do not include a subject line, greeting prefix, or signature — just the reply body text.

${context}

Write the reply now:`;

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genai  = new GoogleGenerativeAI(apiKey);
    const model  = genai.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const suggestion = result.response.text().trim();
    if (!suggestion) return NextResponse.json({ error: "No suggestion generated" }, { status: 500 });
    return NextResponse.json({ suggestion });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
