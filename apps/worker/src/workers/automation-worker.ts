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
  workspace_id:  string | null;
  user_id:       string | null;
  payload:       Record<string, unknown>;
  execution_id?: string;
  resume_node?:  string;
}

type NodeType =
  | "trigger"
  | "sendEmail"
  | "sendWhatsapp"
  | "sendSms"
  | "enrollCampaign"
  | "wait"
  | "condition"
  | "splitAB"
  | "goToStep"
  | "endFlow"
  | "addTag"
  | "removeTag"
  | "changeLifecycle"
  | "createTask"
  | "updateField"
  | "webhook"
  | "grantAcademy";

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

    // ── 2. Trigger-level filters: a flow can demand the firing payload match
    //      specific values (e.g. a tag name) — mismatches are skipped, not run.
    const filters = (flow.trigger_filters ?? {}) as Record<string, unknown>;
    let skipReason: string | null = null;
    for (const [key, expected] of Object.entries(filters)) {
      if (expected == null) continue;
      const actual = resolveVar(key, payload);
      if (String(actual) !== String(expected)) {
        skipReason = `Trigger filter mismatch: ${key} expected "${String(expected)}", got "${String(actual)}"`;
        break;
      }
    }

    // ── 3. Duplicate-policy enforcement — only meaningful with a stable identity.
    if (!skipReason && user_id) {
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
    }

    // ── 4. Create execution record ─────────────────────────────────────────
    const { data: exec, error: execErr } = await db
      .from("automation_executions")
      .insert({
        flow_id:       flow.id,
        flow_version:  flow.version,
        trigger_event: event,
        trigger_data:  payload,
        workspace_id,
        user_id,
        status:        skipReason ? "skipped" : "running",
        skip_reason:   skipReason,
        completed_at:  skipReason ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (execErr || !exec) throw new Error(`Failed to create execution: ${execErr?.message}`);
    if (skipReason) continue;

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
  workspace_id: string | null,
  user_id:      string | null,
  ctx:          Record<string, unknown>,
  execution_id: string,
  start_node:   string | null,
) {
  const { nodes, edges } = flow.flow_definition;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const startNode = start_node
    ? nodeMap.get(start_node)
    : nodes.find(n => n.type === "trigger" || String(n.type).startsWith("trigger_"));

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
    let jumpTo: string | null = null;
    let stepSkipReason: string | null = null;

    // Any flow can start from a legacy named trigger node (e.g. the
    // pre-cleanup `trigger_funnel_optin` type saved in an older flow
    // definition) — these carry no executable behavior, same as "trigger".
    const isTriggerNode = node.type === "trigger" || String(node.type).startsWith("trigger_");

    try {
      if (isTriggerNode) {
        // no-op
      } else {
        switch (node.type) {
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

            // Recipient resolution order:
            //   1. payload.contact_id → crm_contacts.whatsapp_number  (funnel + CRM flows)
            //   2. payload.phone directly (funnel.form_submitted emits this)
            //   3. workspace's whatsapp_number (legacy user.opted_in flows)
            // The first two paths mean a flow triggered by a raw CRM contact
            // (someone who isn't a Leadash workspace owner) can still receive
            // a WhatsApp reply — which is the entire "reply to challenge
            // signups" scenario.
            let phone: string | null = null;

            const contactIdRaw = (ctx as Record<string, unknown>).contact_id;
            if (typeof contactIdRaw === "string" && contactIdRaw) {
              const { data: c } = await db
                .from("crm_contacts")
                .select("whatsapp_number")
                .eq("id", contactIdRaw)
                .maybeSingle();
              phone = (c?.whatsapp_number as string | null) ?? null;
            }

            if (!phone) {
              const payloadPhone = (ctx as Record<string, unknown>).phone;
              if (typeof payloadPhone === "string" && payloadPhone) phone = payloadPhone;
            }

            if (!phone && workspace_id) {
              const { data: ws } = await db
                .from("workspaces")
                .select("whatsapp_number")
                .eq("id", workspace_id)
                .single();
              phone = (ws?.whatsapp_number as string | null) ?? null;
            }

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

          case "sendSms": {
            stepSkipReason = "SMS channel not configured";
            break;
          }

          case "enrollCampaign": {
            stepSkipReason = "Campaign enrollment not implemented — outreach campaigns are a separate customer-facing system";
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

          case "splitAB": {
            const { pct_a } = node.data as { pct_a?: number };
            const threshold = Number(pct_a ?? 50);
            const bucket    = hashToPercent(execution_id);
            nextHandle      = bucket < threshold ? "a" : "b";
            output          = { bucket, threshold, branch: nextHandle };
            break;
          }

          case "goToStep": {
            const { target_node } = node.data as { target_node?: string };
            if (!target_node || !nodeMap.has(target_node)) {
              stepSkipReason = `Go to Step target "${target_node ?? ""}" not found`;
            } else {
              jumpTo = target_node;
              output = { target_node };
            }
            break;
          }

          case "endFlow": {
            output = {};
            break;
          }

          case "addTag":
          case "removeTag": {
            const { tag } = node.data as { tag?: string };
            if (!tag) { stepSkipReason = "No tag configured"; break; }

            const contactId = await resolveContactId(db, workspace_id, user_id, ctx);
            if (!contactId) { stepSkipReason = "No contact identity available"; break; }

            const { data: contact } = await db.from("crm_contacts").select("tags").eq("id", contactId).single();
            const tags: string[] = Array.isArray(contact?.tags) ? contact.tags : [];
            const nextTags = node.type === "addTag"
              ? Array.from(new Set([...tags, tag]))
              : tags.filter(t => t !== tag);

            await db.from("crm_contacts")
              .update({ tags: nextTags, updated_at: new Date().toISOString() })
              .eq("id", contactId);
            output = { contact_id: contactId, tags: nextTags };
            break;
          }

          case "changeLifecycle": {
            const { lifecycle } = node.data as { lifecycle?: string };
            if (!lifecycle) { stepSkipReason = "No lifecycle stage configured"; break; }

            const contactId = await resolveContactId(db, workspace_id, user_id, ctx);
            if (!contactId) { stepSkipReason = "No contact identity available"; break; }

            await db.from("crm_contacts")
              .update({ lifecycle_stage: lifecycle, updated_at: new Date().toISOString() })
              .eq("id", contactId);
            output = { contact_id: contactId, lifecycle };
            break;
          }

          case "createTask": {
            const { title, due_days } = node.data as { title?: string; due_days?: number };
            if (!title) { stepSkipReason = "No task title configured"; break; }

            const contactId = await resolveContactId(db, workspace_id, user_id, ctx);
            if (!contactId) { stepSkipReason = "No contact identity available"; break; }

            const dueAt = new Date(Date.now() + (due_days ?? 1) * 24 * 60 * 60 * 1000);
            const { data: task } = await db
              .from("crm_tasks")
              .insert({ contact_id: contactId, title: resolveTemplate(title, ctx), due_at: dueAt.toISOString() })
              .select("id")
              .single();

            output = { contact_id: contactId, task_id: task?.id };
            break;
          }

          case "grantAcademy": {
            const { product_id } = node.data as { product_id?: string };
            if (!product_id) { stepSkipReason = "No academy product configured"; break; }
            if (!workspace_id || !user_id) { stepSkipReason = "No account to grant academy access to"; break; }

            const { data: existingEnrollment } = await db
              .from("academy_enrollments")
              .select("id")
              .eq("workspace_id", workspace_id)
              .eq("user_id", user_id)
              .eq("product_id", product_id)
              .maybeSingle();

            if (existingEnrollment) {
              output = { enrollment_id: existingEnrollment.id, already_enrolled: true };
            } else {
              const { data: enrollment, error: enrollErr } = await db
                .from("academy_enrollments")
                .insert({ workspace_id, user_id, product_id, access_type: "admin_granted", status: "active" })
                .select("id")
                .single();
              if (enrollErr) throw new Error(`Failed to grant academy access: ${enrollErr.message}`);
              output = { enrollment_id: enrollment?.id, already_enrolled: false };
            }
            break;
          }

          case "updateField": {
            const { table, column, value } = node.data as {
              table: "workspaces" | "funnel_states"; column: string; value: unknown;
            };
            if (table === "funnel_states" && !user_id)      { stepSkipReason = "No user context for funnel_states update"; break; }
            if (table === "workspaces"    && !workspace_id) { stepSkipReason = "No workspace context for workspaces update"; break; }

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

          default:
            stepSkipReason = `Unsupported node type: ${node.type}`;
        }
      }

      if (stepSkipReason) {
        await db.from("automation_execution_steps")
          .update({ status: "skipped", skip_reason: stepSkipReason, completed_at: new Date().toISOString() })
          .eq("id", step?.id ?? "");
      } else {
        await db.from("automation_execution_steps")
          .update({ status: "completed", output, completed_at: new Date().toISOString() })
          .eq("id", step?.id ?? "");
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.from("automation_execution_steps")
        .update({ status: "failed", error_message: msg, completed_at: new Date().toISOString() })
        .eq("id", step?.id ?? "");
      await failExecution(db, execution_id, msg);
      return;
    }

    if (shouldPause) return;
    if (node.type === "endFlow") break;
    currentId = jumpTo ?? getNextNodeId(currentId, edges, nextHandle);
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
    // Case-insensitive by default — keyword matching on user-typed text
    // ("PAID" vs "paid" vs "Paid") should behave the same. Flows that need
    // exact match can normalise with an updateField step first.
    case "contains":     return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case "not_contains": return !String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case "is_null":      return actual == null;
    case "is_not_null":  return actual != null;
    default:             return false;
  }
}

// Deterministic 0-99 bucket for a given seed string — used by splitAB so the
// same execution always lands in the same branch even if the step re-runs.
function hashToPercent(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

// Resolves the crm_contacts row a CRM-mutating step should act on: by
// (workspace_id, user_id) when we have an account, falling back to email
// (the same identity bridge checkout/route.ts uses for anonymous-then-signup
// contacts), creating a new contact row when neither lookup finds one.
async function resolveContactId(
  db: DB,
  workspace_id: string | null,
  user_id: string | null,
  ctx: Record<string, unknown>,
): Promise<string | null> {
  const email = typeof ctx.email === "string" ? ctx.email : undefined;

  if (workspace_id && user_id) {
    const { data } = await db
      .from("crm_contacts")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user_id)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (email) {
    const { data } = await db.from("crm_contacts").select("id").ilike("email", email).maybeSingle();
    if (data?.id) {
      if (workspace_id && user_id) {
        await db.from("crm_contacts")
          .update({ workspace_id, user_id })
          .eq("id", data.id)
          .is("user_id", null);
      }
      return data.id;
    }
  }

  if (!workspace_id && !user_id && !email) return null;

  const { data: created } = await db
    .from("crm_contacts")
    .insert({ workspace_id, user_id, email: email ?? null, display_name: email ?? "Unknown" })
    .select("id")
    .single();

  return created?.id ?? null;
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
