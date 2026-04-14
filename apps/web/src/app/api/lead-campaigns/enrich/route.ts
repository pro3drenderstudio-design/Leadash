import { NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { personalizeLeads } from "@/lib/lead-campaigns/gemini";

export const maxDuration = 60;

const MAX_LEADS     = 5000;
const COST_PER_LEAD = 0.5;
const CONCURRENCY   = 20; // leads processed in parallel per batch

interface LeadInput {
  email?:      string | null;
  first_name?: string | null;
  last_name?:  string | null;
  title?:      string | null;
  company?:    string | null;
  industry?:   string | null;
  website?:    string | null;
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { leads, prompt } = await req.json() as { leads?: LeadInput[]; prompt?: string };
  if (!Array.isArray(leads) || !leads.length)
    return new Response(JSON.stringify({ error: "leads array is required" }), { status: 400 });
  if (!prompt?.trim())
    return new Response(JSON.stringify({ error: "prompt is required" }), { status: 400 });
  if (leads.length > MAX_LEADS)
    return new Response(JSON.stringify({ error: `Maximum ${MAX_LEADS} leads per request` }), { status: 400 });

  const cost = leads.length * COST_PER_LEAD;
  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  if (!ws || (ws.lead_credits_balance as number) < cost)
    return new Response(JSON.stringify({ error: `Insufficient credits. Need ${cost}, have ${ws?.lead_credits_balance ?? 0}.` }), { status: 402 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const allResults: Array<LeadInput & { personalized_line: string }> = [];

      try {
        for (let i = 0; i < leads.length; i += CONCURRENCY) {
          const chunk = leads.slice(i, i + CONCURRENCY);
          const lines = await personalizeLeads(chunk, prompt!.trim());
          const batch = chunk.map((lead, j) => ({ ...lead, personalized_line: lines[j] ?? "" }));
          allResults.push(...batch);
          send({ type: "progress", processed: allResults.length, total: leads.length, batch });
        }

        // Deduct credits
        await db.from("workspaces")
          .update({ lead_credits_balance: (ws.lead_credits_balance as number) - cost })
          .eq("id", workspaceId);
        await db.from("lead_credit_transactions").insert({
          workspace_id: workspaceId,
          amount:       -cost,
          type:         "consume",
          description:  `AI enrichment — ${leads.length} leads`,
        });

        // Save job (90-day retention)
        await db.from("lead_enrichment_jobs").insert({
          workspace_id:  workspaceId,
          total:         leads.length,
          prompt:        prompt!.trim().slice(0, 500),
          results:       allResults,
          credits_used:  cost,
          completed_at:  new Date().toISOString(),
          expires_at:    new Date(Date.now() + 90 * 86_400_000).toISOString(),
        }).catch(() => {});

        send({ type: "done", credits_used: cost });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
