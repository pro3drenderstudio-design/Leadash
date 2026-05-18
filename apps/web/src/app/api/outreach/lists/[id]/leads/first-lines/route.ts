import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const BATCH = 25; // leads per OpenAI call
const MAX_IDS = 200;

interface LeadInput {
  id:           string;
  name:         string | null;
  title:        string | null;
  company:      string | null;
  email_domain: string;
}

async function generateBatch(leads: LeadInput[], apiKey: string): Promise<{ id: string; first_line: string }[]> {
  const prompt = `Generate personalized cold email opening first lines for these leads.

Each first line must:
- Be exactly 1 sentence, 15–25 words
- Reference something specific about their role, company, or industry
- Sound natural and conversational, never templated
- NOT start with "I", "Hi", "Congrats", or "Impressive"
- NOT use "came across your profile" or similar generic phrases
- If company/title are missing, infer context from the email domain

Leads:
${JSON.stringify(leads)}

Return JSON only: {"results":[{"id":"...","first_line":"..."}]}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model:           "gpt-4o-mini",
      messages:        [
        { role: "system", content: "You generate personalized cold email first lines. Return JSON only." },
        { role: "user",   content: prompt },
      ],
      max_tokens:      leads.length * 60,
      temperature:     0.8,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data   = await res.json();
  const text   = (data?.choices?.[0]?.message?.content ?? "{}").trim();
  const parsed = JSON.parse(text) as { results?: { id: string; first_line: string }[] };
  return parsed.results ?? [];
}

// ─── POST — generate (no DB save, client previews) ────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;
  const { id: listId }  = await params;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `Max ${MAX_IDS} leads per generation` }, { status: 400 });

  const db = createAdminClient();

  // Verify list + fetch leads
  const { data: list } = await db.from("outreach_lists").select("id").eq("id", listId).eq("workspace_id", workspaceId).single();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const { data: leads } = await db
    .from("outreach_leads")
    .select("id,email,first_name,last_name,company,title")
    .in("id", ids)
    .eq("list_id", listId)
    .eq("workspace_id", workspaceId);

  if (!leads?.length) return NextResponse.json({ error: "No leads found" }, { status: 404 });

  type LeadRow = { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null };
  const typedLeads = leads as LeadRow[];

  const inputs: LeadInput[] = typedLeads.map(l => ({
    id:           l.id,
    name:         [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
    title:        l.title   ?? null,
    company:      l.company ?? null,
    email_domain: l.email.split("@")[1] ?? "",
  }));

  // Chunk into batches, run up to 3 in parallel
  const batches: LeadInput[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) batches.push(inputs.slice(i, i + BATCH));

  const results: { id: string; first_line: string }[] = [];
  for (let i = 0; i < batches.length; i += 3) {
    const chunk = await Promise.all(batches.slice(i, i + 3).map(b => generateBatch(b, apiKey)));
    results.push(...chunk.flat());
  }

  // Merge back with display name + email for the preview modal
  const enriched = results.map(r => {
    const lead = typedLeads.find((l: LeadRow) => l.id === r.id);
    return {
      id:         r.id,
      first_name: lead?.first_name ?? null,
      email:      lead?.email ?? "",
      first_line: r.first_line,
    };
  });

  return NextResponse.json({ results: enriched });
}

// ─── PATCH — save confirmed first lines to DB ─────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;
  const { id: listId }  = await params;

  const { updates } = await req.json() as { updates: { id: string; first_line: string }[] };
  if (!Array.isArray(updates) || updates.length === 0) return NextResponse.json({ error: "updates required" }, { status: 400 });

  const db = createAdminClient();

  await Promise.all(
    updates.map(u =>
      db.from("outreach_leads")
        .update({ first_line: u.first_line })
        .eq("id", u.id)
        .eq("list_id", listId)
        .eq("workspace_id", workspaceId),
    ),
  );

  return NextResponse.json({ ok: true, saved: updates.length });
}
