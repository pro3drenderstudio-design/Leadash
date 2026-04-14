// ─── Enrich Bulk Worker ───────────────────────────────────────────────────────
// Processes standalone AI personalization jobs (not tied to a campaign).
// Handles 50k+ leads without any timeout constraint.

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

const CONCURRENCY  = 20;
const OPENAI_BASE  = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrichBulkJobData {
  job_id:       string;
  workspace_id: string;
}

interface LeadInput {
  email?:      string | null;
  first_name?: string | null;
  last_name?:  string | null;
  title?:      string | null;
  company?:    string | null;
  industry?:   string | null;
  website?:    string | null;
}

interface EnrichedLead extends LeadInput {
  personalized_line: string;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

function getDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ─── OpenAI personalization ───────────────────────────────────────────────────

async function personalizeSingle(apiKey: string, lead: LeadInput, productPrompt: string): Promise<string> {
  try {
    const name    = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "there";
    const context = [
      lead.title,
      lead.company  && `at ${lead.company}`,
      lead.industry && `(${lead.industry} industry)`,
    ].filter(Boolean).join(" ");

    const res = await fetch(OPENAI_BASE, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:       OPENAI_MODEL,
        messages: [
          {
            role:    "system",
            content: "You are a cold email expert. Write single personalized icebreaker opening lines. Output only the line — no quotes, no greeting, nothing else.",
          },
          {
            role:    "user",
            content: `Write a personalized icebreaker opening line (1-2 sentences, max 30 words) for a cold email to ${name}${context ? `, ${context}` : ""}.\n\nThe email is about: ${productPrompt}\n\nRules:\n- Reference something specific about their role, company, or industry\n- Sound natural and human, not salesy\n- No generic openers like "I came across your profile"\n- Do NOT start with "Hi [name]" — just the icebreaker line`,
          },
        ],
        max_tokens:  120,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return "";
    const data    = await res.json() as Record<string, unknown>;
    const choices = data?.choices as Array<{ message?: { content?: string } }>;
    const text    = choices?.[0]?.message?.content ?? "";
    return text.trim().replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processEnrichBulk(job: Job<EnrichBulkJobData>): Promise<void> {
  const { job_id, workspace_id } = job.data;
  const db      = getDb();
  const apiKey  = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    await db.from("lead_enrichment_jobs")
      .update({ status: "failed", error: "OPENAI_API_KEY not configured" })
      .eq("id", job_id);
    return;
  }

  // Fetch job record (contains the leads array and prompt)
  const { data: jobRecord, error } = await db
    .from("lead_enrichment_jobs")
    .select("id, leads, prompt, total, workspace_id")
    .eq("id", job_id)
    .eq("workspace_id", workspace_id)
    .single();

  if (error || !jobRecord) {
    console.error(`[enrich-bulk] ${job_id}: job record not found`);
    return;
  }

  const leads  = (jobRecord.leads  as LeadInput[]) ?? [];
  const prompt = (jobRecord.prompt as string)      ?? "";

  if (!leads.length) {
    await db.from("lead_enrichment_jobs")
      .update({ status: "done", processed: 0, completed_at: now() })
      .eq("id", job_id);
    return;
  }

  // Mark running
  await db.from("lead_enrichment_jobs")
    .update({ status: "running" })
    .eq("id", job_id);

  console.log(`[enrich-bulk] ${job_id}: START ${leads.length} leads`);

  const allResults: EnrichedLead[] = [];
  let lastDbUpdate = Date.now();
  let zeroStreak   = 0;

  try {
    for (let i = 0; i < leads.length; i += CONCURRENCY) {
      const chunk   = leads.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map(lead => personalizeSingle(apiKey, lead, prompt)),
      );

      const batch = chunk.map((lead, j) => ({
        ...lead,
        personalized_line: settled[j].status === "fulfilled" ? settled[j].value : "",
      }));

      const anySucceeded = batch.some(r => r.personalized_line);
      if (!anySucceeded) {
        zeroStreak++;
        if (zeroStreak >= 3) {
          console.warn(`[enrich-bulk] ${job_id}: 3 consecutive zero batches — stopping`);
          break;
        }
      } else {
        zeroStreak = 0;
      }

      allResults.push(...batch);

      // Update processed count every 5s
      if (Date.now() - lastDbUpdate > 5_000) {
        await db.from("lead_enrichment_jobs")
          .update({ processed: allResults.length })
          .eq("id", job_id);
        lastDbUpdate = Date.now();
        await job.updateProgress({ processed: allResults.length, total: leads.length });
      }
    }

    await db.from("lead_enrichment_jobs").update({
      status:       "done",
      processed:    allResults.length,
      results:      allResults,
      completed_at: now(),
    }).eq("id", job_id);

    console.log(`[enrich-bulk] ${job_id}: DONE ${allResults.length} leads`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[enrich-bulk] ${job_id}: FAILED`, msg);
    await db.from("lead_enrichment_jobs")
      .update({ status: "failed", error: msg, processed: allResults.length })
      .eq("id", job_id);
  }
}

function now() { return new Date().toISOString(); }
