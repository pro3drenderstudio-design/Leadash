import { NextRequest } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export const maxDuration = 60;

const MAX_EMAILS    = 5_000;
const COST_PER      = 0.5;
const CONCURRENCY   = 20;
const REOON_BASE    = "https://emailverifier.reoon.com/api/v1";

async function verifySingle(apiKey: string, email: string) {
  try {
    const url = `${REOON_BASE}/verify?email=${encodeURIComponent(email)}&key=${apiKey}&mode=power`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { email, status: "unknown", score: 0 };
    const d = await res.json() as Record<string, unknown>;
    return {
      email:  (d.email  as string) ?? email,
      status: (d.status as string) ?? "unknown",
      score:  typeof d.overall_score === "number" ? d.overall_score : 0,
    };
  } catch {
    return { email, status: "unknown", score: 0 };
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { emails } = await req.json() as { emails?: string[] };
  if (!Array.isArray(emails) || !emails.length)
    return new Response(JSON.stringify({ error: "emails array is required" }), { status: 400 });
  if (emails.length > MAX_EMAILS)
    return new Response(JSON.stringify({ error: `Maximum ${MAX_EMAILS} emails per batch` }), { status: 400 });

  const apiKey = process.env.REOON_API_KEY;
  if (!apiKey)
    return new Response(JSON.stringify({ error: "REOON_API_KEY not configured" }), { status: 500 });

  const cost = emails.length * COST_PER;
  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  if (!ws || (ws.lead_credits_balance as number) < cost)
    return new Response(JSON.stringify({ error: `Insufficient credits. Need ${cost}, have ${ws?.lead_credits_balance ?? 0}.` }), { status: 402 });

  const clean = emails.map((e: string) => e.trim().toLowerCase());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const allResults: Array<{ email: string; status: string; score: number }> = [];

      try {
        for (let i = 0; i < clean.length; i += CONCURRENCY) {
          const chunk   = clean.slice(i, i + CONCURRENCY);
          const settled = await Promise.allSettled(chunk.map(e => verifySingle(apiKey, e)));
          const batch   = settled.map((s, j) =>
            s.status === "fulfilled" ? s.value : { email: chunk[j], status: "unknown", score: 0 },
          );
          allResults.push(...batch);
          send({ type: "progress", processed: allResults.length, total: clean.length, batch });
        }

        // Deduct credits
        await db.from("workspaces")
          .update({ lead_credits_balance: (ws.lead_credits_balance as number) - cost })
          .eq("id", workspaceId);
        await db.from("lead_credit_transactions").insert({
          workspace_id: workspaceId,
          amount:       -cost,
          type:         "consume",
          description:  `Bulk email verification — ${clean.length} emails`,
        });

        // Save job (90-day retention) — silently skips if table doesn't exist
        const counts = allResults.reduce((acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        await db.from("lead_verification_jobs").insert({
          workspace_id:  workspaceId,
          status:        "done",
          total:         clean.length,
          safe:          counts.safe        ?? 0,
          invalid:       counts.invalid     ?? 0,
          catch_all:     counts.catch_all   ?? 0,
          risky:         counts.risky       ?? 0,
          dangerous:     counts.dangerous   ?? 0,
          disposable:    counts.disposable  ?? 0,
          unknown:       counts.unknown     ?? 0,
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
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
