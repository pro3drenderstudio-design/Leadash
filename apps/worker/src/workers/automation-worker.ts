/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Job } from "bullmq";
import { Queue } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import IORedis from "ioredis";

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const RESEND_FROM    = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.io";
const REDIS_URL      = process.env.UPSTASH_REDIS_URL!;

export interface AutomationJobData {
  event:         string;
  workspace_id:  string;
  user_id:       string;
  payload:       Record<string, unknown>;
  execution_id?: string;
  resume_node?:  string;
}

type NodeType =
  | "trigger"
  | "sendEmail"
  | "sendWhatsapp"
  | "wait"
  | "condition"
  | "updateField"
  | "webhook";

interface FlowNode {
  id:   string;
  type: NodeType;
  data: Record<string, unknown>;
}

interface FlowEdge {
  id:            string;
  source:        string;
  target:        string;
  sourceHandle?: string;
}

interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// Use `any` DB type — the worker has no generated Supabase schema types.
type DB = any;

export async function processAutomation(job: Job<AutomationJobData>) {
  const db: DB = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { event, workspace_id, user_id, payload, execution_id, resume_node } = job.data;

  // ── 1. Find matching active flows ─────────────────────────────────────────
  const { data: flows, error: flowErr } = await db
    .from("automation_flows")
    .select("id, duplicate_policy, flow_definition, version, trigger_filters")
    .eq("trigger_event", event)
    .eq("is_active", true);

  if (flowErr) throw new Error(`Failed to fetch flows: ${flowErr.message}`);
  if (!flows || flows.length === 0) return;

  for (const flow of flows) {
    if (resume_node && execution_id) {
      await executeFlow(db, flow, workspace_id, user_id, payload, execution_id, resume_node);
      continue;
    }

    // ── 2. Duplicate-policy enforcement ──────────────────────────────────────
    const { data: existing } = await db
      .from("automation_executions")
      .select("id, status")
      .eq("flow_id", flow.id)
      .eq("user_id", user_id)
      .in("status", ["running", "paused"])
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (flow.duplicate_policy === "deduplicate") {
        console.log(`[automation] deduplicate: skipping flow=${flow.id} user=${user_id}`);
        continue;
      }
      if (flow.duplicate_policy === "restart") {
        await db.from("automation_executions")
          .update({ status: "cancelled", completed_at: new Date().toISOString() })
          .eq("id", existing.id);
        console.log(`[automation] restart: cancelled execution=${existing.id}`);
      }
    }

    // ── 3. Create execution record ─────────────────────────────────────────
    const { data: exec, error: execErr } = await db
      .from("automation_executions")
      .insert({
        flow_id:       flow.id,
        flow_version:  flow.version,
        trigger_event: event,
        trigger_data:  payload,
        workspace_id,
        user_id,
        status:        "running",
      })
      .select("id")
      .single();

    if (execErr || !exec) throw new Error(`Failed to create execution: ${execErr?.message}`);

    // Snapshot version
    await db.from("automation_flow_versions")
      .upsert({
        flow_id:         flow.id,
        version:         flow.version,
        flow_definition: flow.flow_definition,
        published_at:    new Date().toISOString(),
      }, { onConflict: "flow_id,version", ignoreDuplicates: true });

    await executeFlow(db, flow, workspace_id, user_id, payload, exec.id, null);
  }
}

// ── Flow execution engine ──────────────────────────────────────────────────
async function executeFlow(
  db:           DB,
  flow:         { id: string; flow_definition: FlowDefinition; version: number },
  workspace_id: string,
  user_id:      string,
  ctx:          Record<string, unknown>,
  execution_id: string,
  start_node:   string | null,
) {
  const { nodes, edges } = flow.flow_definition;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const startNode = start_node
    ? nodeMap.get(start_node)
    : nodes.find(n => n.type === "trigger");

  if (!startNode) {
    await failExecution(db, execution_id, "No start node found");
    return;
  }

  let currentId: string | null = startNode.id;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) {
      await failExecution(db, execution_id, `Cycle detected at node ${currentId}`);
      return;
    }
    visited.add(currentId);

    const node = nodeMap.get(currentId);
    if (!node) break;

    await db.from("automation_executions")
      .update({ current_node_id: currentId })
      .eq("id", execution_id);

    const { data: step } = await db
      .from("automation_execution_steps")
      .insert({
        execution_id,
        node_id:    node.id,
        node_type:  node.type,
        status:     "running",
        input:      ctx,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    let output: Record<string, unknown> = {};
    let nextHandle: string | undefined;
    let shouldPause = false;

    try {
      switch (node.type) {
        case "trigger":
          break;

        case "sendEmail": {
          const { to, subject, html, from_name } = node.data as {
            to: string; subject: string; html: string; from_name?: string;
          };
          const recipient       = resolveVar(to, ctx) as string;
          const renderedSubject = resolveTemplate(subject, ctx);
          const renderedHtml    = resolveTemplate(html, ctx);
          const fromLine        = from_name ? `${from_name} <${RESEND_FROM}>` : RESEND_FROM;

          const res = await fetch("https://api.resend.com/emails", {
            method:  "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type":  "application/json",
            },
            body: JSON.stringify({ from: fromLine, to: recipient, subject: renderedSubject, html: renderedHtml }),
          });
          const sent = await res.json() as { id?: string; error?: { message: string } };
          if (!res.ok) throw new Error(sent?.error?.message ?? `Resend error ${res.status}`);
          output = { resend_id: sent?.id };
          break;
        }

        case "sendWhatsapp": {
          const { template_name, template_params, body } = node.data as {
            template_name?: string;
            template_params?: Record<string, string>;
            body?: string;
          };

          const { data: ws } = await db
            .from("workspaces")
            .select("whatsapp_number")
            .eq("id", workspace_id)
            .single();

          const phone = ws?.whatsapp_number as string | null;
          if (!phone) { output = { skipped: "no_phone" }; break; }

          const resolvedParams = template_params
            ? Object.fromEntries(Object.entries(template_params).map(([k, v]) => [k, resolveTemplate(v, ctx)]))
            : undefined;

          const { data: msg } = await db
            .from("whatsapp_messages")
            .insert({
              phone_number:    phone,
              direction:       "outbound",
              template_name:   template_name ?? null,
              template_params: resolvedParams ?? null,
              body:            body ? resolveTemplate(body, ctx) : null,
              status:          "pending",
              source:          "automation",
            })
            .select("id")
            .single();

          if (msg?.id) {
            const q = new Queue("leadash:whatsapp", { connection: getRedisConnection() });
            await q.add("whatsapp", {
              message_id:      msg.id,
              phone_number:    phone,
              template_name,
              template_params: resolvedParams,
              body:            body ? resolveTemplate(body, ctx) : undefined,
              source:          "automation",
            }, { attempts: 6, backoff: { type: "exponential", delay: 60_000 }, removeOnComplete: 100 });
            output = { message_id: msg.id };
          }
          break;
        }

        case "wait": {
          const { duration_minutes } = node.data as { duration_minutes: number };
          const resumeAt = new Date(Date.now() + duration_minutes * 60 * 1000);

          await db.from("automation_executions")
            .update({ status: "paused", current_node_id: node.id })
            .eq("id", execution_id);

          const { data: execRow } = await db
            .from("automation_executions")
            .select("workspace_id, user_id")
            .eq("id", execution_id)
            .single();

          const q = new Queue("leadash:automation", { connection: getRedisConnection() });
          await q.add("automation", {
            event:        `automation.resume.${execution_id}`,
            workspace_id: execRow?.workspace_id ?? workspace_id,
            user_id:      execRow?.user_id      ?? user_id,
            payload:      ctx,
            execution_id,
            resume_node:  getNextNodeId(node.id, edges, undefined),
          } as AutomationJobData, {
            delay:    resumeAt.getTime() - Date.now(),
            attempts: 3,
            backoff:  { type: "fixed", delay: 5_000 },
          });

          output = { resumes_at: resumeAt.toISOString() };
          shouldPause = true;
          break;
        }

        case "condition": {
          const { field, operator, value } = node.data as {
            field: string; operator: string; value: unknown;
          };
          const actual = resolveVar(field, ctx);
          const result = evaluateCondition(actual, operator, value);
          nextHandle   = result ? "yes" : "no";
          output       = { result, field, actual };
          break;
        }

        case "updateField": {
          const { table, column, value } = node.data as {
            table: "workspaces" | "funnel_states"; column: string; value: unknown;
          };
          const resolvedValue = typeof value === "string" ? resolveTemplate(value, ctx) : value;

          if (table === "funnel_states") {
            await db.from("funnel_states")
              .upsert({ user_id, [column]: resolvedValue }, { onConflict: "user_id" });
          } else if (table === "workspaces") {
            await db.from("workspaces")
              .update({ [column]: resolvedValue })
              .eq("id", workspace_id);
          }
          output = { table, column, value: resolvedValue };
          ctx    = { ...ctx, [column]: resolvedValue };
          break;
        }

        case "webhook": {
          const { url, method = "POST", headers = {} } = node.data as {
            url: string; method?: string; headers?: Record<string, string>;
          };
          const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", ...headers },
            body:    JSON.stringify({ execution_id, workspace_id, user_id, ctx }),
          });
          output = { status: res.status, ok: res.ok };
          if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
          break;
        }
      }

      await db.from("automation_execution_steps")
        .update({ status: "completed", output, completed_at: new Date().toISOString() })
        .eq("id", step?.id ?? "");

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.from("automation_execution_steps")
        .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
        .eq("id", step?.id ?? "");
      await failExecution(db, execution_id, msg);
      return;
    }

    if (shouldPause) return;
    currentId = getNextNodeId(currentId, edges, nextHandle);
  }

  await db.from("automation_executions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", execution_id);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getNextNodeId(nodeId: string, edges: FlowEdge[], handle: string | undefined): string | null {
  const edge = edges.find(e => e.source === nodeId && (handle == null || e.sourceHandle === handle));
  return edge?.target ?? null;
}

function resolveVar(path: string, ctx: Record<string, unknown>): unknown {
  return path.split(".").reduce<unknown>((obj, key) => {
    if (obj && typeof obj === "object") return (obj as Record<string, unknown>)[key];
    return undefined;
  }, ctx);
}

function resolveTemplate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const val = resolveVar(path, ctx);
    return val != null ? String(val) : "";
  });
}

function evaluateCondition(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "eq":           return actual === expected;
    case "neq":          return actual !== expected;
    case "gt":           return Number(actual) > Number(expected);
    case "lt":           return Number(actual) < Number(expected);
    case "gte":          return Number(actual) >= Number(expected);
    case "lte":          return Number(actual) <= Number(expected);
    case "contains":     return String(actual).includes(String(expected));
    case "not_contains": return !String(actual).includes(String(expected));
    case "is_null":      return actual == null;
    case "is_not_null":  return actual != null;
    default:             return false;
  }
}

async function failExecution(db: DB, execution_id: string, message: string) {
  console.error(`[automation] execution=${execution_id} failed: ${message}`);
  await db.from("automation_executions")
    .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
    .eq("id", execution_id);
}

let _conn: IORedis | null = null;
function getRedisConnection(): IORedis {
  if (!_conn) {
    _conn = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      tls: REDIS_URL?.startsWith("rediss://") ? {} : undefined,
    });
  }
  return _conn;
}
