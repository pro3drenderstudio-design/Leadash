"use client";
import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Trigger catalogue ──────────────────────────────────────────────────────

const TRIGGER_GROUPS = [
  {
    label: "User Events",
    icon: "👤",
    color: "#8b5cf6",
    items: [
      { event: "user.opted_in",            label: "Opted in",           desc: "Contact submitted a form or opted in to marketing" },
      { event: "user.bundle_purchased",    label: "Bundle purchased",   desc: "Paid for the main Leadash bundle" },
      { event: "user.bundle_renewed",      label: "Bundle renewed",     desc: "Subscription renewed successfully" },
      { event: "user.bundle_expired",      label: "Bundle expired",     desc: "Subscription lapsed or wasn't renewed" },
      { event: "user.challenge_enrolled",  label: "Challenge enrolled", desc: "Enrolled in the 30-day challenge" },
      { event: "user.video_milestone",     label: "Watched a video",    desc: "Reached a video watch milestone" },
      { event: "user.day1_completed",      label: "Completed Day 1",    desc: "Finished all Day 1 challenge tasks" },
    ],
  },
  {
    label: "Academy",
    icon: "🎓",
    color: "#6366f1",
    items: [
      { event: "academy.enrollment_created",      label: "Course enrolled",     desc: "Signed up for a course" },
      { event: "academy.lesson_completed",        label: "Lesson completed",    desc: "Finished watching a lesson" },
      { event: "academy.course_completed",        label: "Course completed",    desc: "Completed all required lessons" },
      { event: "academy.challenge_day_completed", label: "Challenge day done",  desc: "Finished tasks for a challenge day" },
      { event: "academy.streak_broken",           label: "Streak broken",       desc: "Missed days and lost their streak" },
      { event: "challenge.daily_reminder",        label: "Daily reminder time", desc: "Hourly check — reminder time reached" },
      { event: "challenge.day_missed",            label: "Day not completed",   desc: "Evening check — today's tasks still undone" },
    ],
  },
  {
    label: "Offers & Billing",
    icon: "💳",
    color: "#f97316",
    items: [
      { event: "offers.purchase_created",     label: "Offer purchased",    desc: "Completed any offer at any price" },
      { event: "offers.refund_issued",        label: "Refund issued",      desc: "Admin issued a refund" },
      { event: "offers.custom_grant_pending", label: "Manual perk needed", desc: "A custom perk needs manual fulfillment" },
      { event: "billing.payment_failed",      label: "Payment failed",     desc: "A subscription charge was declined" },
    ],
  },
  {
    label: "CRM",
    icon: "🏷",
    color: "#64748b",
    items: [
      { event: "crm.tag_added", label: "Tag added to contact", desc: "A tag was applied to a contact" },
    ],
  },
] as const;

type TriggerItem = (typeof TRIGGER_GROUPS)[number]["items"][number];

const TRIGGER_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TRIGGER_GROUPS.flatMap(g => g.items.map(i => [i.event, i.label])),
);

// ── Step node catalogue ────────────────────────────────────────────────────

type NodeMeta = {
  label: string; color: string; icon: string; category: string;
  description: string; comingSoon?: boolean;
};

const NODE_META: Record<string, NodeMeta> = {
  trigger:         { label: "Trigger",         color: "#8b5cf6", icon: "⚡", category: "Triggers",      description: "" },
  sendEmail:       { label: "Send Email",      color: "#f97316", icon: "✉",  category: "Communication", description: "Send a personalised email to this contact" },
  sendWhatsapp:    { label: "Send WhatsApp",   color: "#22c55e", icon: "💬", category: "Communication", description: "Send a WhatsApp message" },
  sendSms:         { label: "Send SMS",        color: "#14b8a6", icon: "📱", category: "Communication", description: "SMS sending — coming soon", comingSoon: true },
  enrollCampaign:  { label: "Add to Campaign", color: "#f97316", icon: "📧", category: "Communication", description: "Outreach campaigns — coming soon", comingSoon: true },
  addTag:          { label: "Add Tag",         color: "#64748b", icon: "🏷",  category: "CRM",           description: "Apply a label to this contact" },
  removeTag:       { label: "Remove Tag",      color: "#64748b", icon: "🏷",  category: "CRM",           description: "Remove a label from this contact" },
  changeLifecycle: { label: "Move Stage",      color: "#64748b", icon: "👤", category: "CRM",           description: "Update their stage in the pipeline" },
  createTask:      { label: "Create Task",     color: "#64748b", icon: "✓",  category: "CRM",           description: "Assign a to-do to your team" },
  updateField:     { label: "Update Data",     color: "#64748b", icon: "✏",  category: "Advanced",      description: "Set a custom data field on the contact" },
  webhook:         { label: "Webhook",         color: "#ec4899", icon: "🔗", category: "Advanced",      description: "Send data to an external URL" },
  grantAcademy:    { label: "Grant Course",    color: "#6366f1", icon: "🎓", category: "Academy",       description: "Give access to a course or challenge" },
  wait:            { label: "Wait",            color: "#3b82f6", icon: "⏳", category: "Logic",         description: "Pause before continuing to the next step" },
  condition:       { label: "If / Else",       color: "#eab308", icon: "↔",  category: "Logic",         description: "Branch the flow based on a condition" },
  splitAB:         { label: "A/B Split",       color: "#7c3aed", icon: "🔀", category: "Logic",         description: "Randomly send contacts down two paths" },
  goToStep:        { label: "Jump to Step",    color: "#6b7280", icon: "↗",  category: "Logic",         description: "Skip to a different step in this flow" },
  endFlow:         { label: "End",             color: "#6b7280", icon: "■",  category: "Logic",         description: "Stop the automation for this contact" },
};

const STEP_CATEGORIES = ["Communication", "CRM", "Academy", "Logic", "Advanced"] as const;

// ── Duration helpers ───────────────────────────────────────────────────────

function minutesToHuman(mins: number): string {
  if (!mins || mins < 1) return "—";
  if (mins < 60)  { const v = Math.round(mins);  return `${v} min${v  === 1 ? "" : "s"}`; }
  const hrs  = Math.round(mins / 60);
  if (hrs < 24)   return `${hrs} hour${hrs  === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  if (days < 7)   return `${days} day${days === 1 ? "" : "s"}`;
  const wks  = Math.round(days / 7);
  return `${wks} week${wks === 1 ? "" : "s"}`;
}

function getWaitParts(minutes: number): { value: number; unit: "minutes" | "hours" | "days" | "weeks" } {
  if (minutes >= 10080 && minutes % 10080 === 0) return { value: minutes / 10080, unit: "weeks" };
  if (minutes >= 1440  && minutes % 1440  === 0) return { value: minutes / 1440,  unit: "days" };
  if (minutes >= 60    && minutes % 60    === 0) return { value: minutes / 60,    unit: "hours" };
  return { value: minutes || 60, unit: "minutes" };
}

const UNIT_MINS: Record<string, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };

// ── Condition operator labels ──────────────────────────────────────────────

const OPERATOR_LABELS: Record<string, string> = {
  eq:           "equals",
  neq:          "does not equal",
  gt:           "is greater than",
  lt:           "is less than",
  gte:          "is at least",
  lte:          "is at most",
  contains:     "contains",
  not_contains: "does not contain",
  is_null:      "is empty",
  is_not_null:  "is not empty",
};

// ── Canvas node renderer ───────────────────────────────────────────────────

function FlowNode({ data, type }: { data: Record<string, unknown>; type: string }) {
  const meta = NODE_META[type] ?? { label: type, color: "#6b7280", icon: "•", description: "" };
  const isCondition = type === "condition";
  const isSplitAB   = type === "splitAB";
  const isTrigger   = type === "trigger" || String(type).startsWith("trigger_");

  function previewText() {
    const event = String(data.event ?? "");
    if (type === "trigger")         return TRIGGER_LABEL_MAP[event] ?? (event || "Choose a trigger");
    if (type === "sendEmail")       return String(data.subject ?? "Email subject");
    if (type === "sendWhatsapp")    return String(data.template_name ?? data.body ?? "WhatsApp message");
    if (type === "sendSms")         return String(data.body ?? "SMS body");
    if (type === "enrollCampaign")  return "Add to campaign";
    if (type === "addTag")          return `+ ${String(data.tag ?? "tag name")}`;
    if (type === "removeTag")       return `− ${String(data.tag ?? "tag name")}`;
    if (type === "changeLifecycle") return `→ ${String(data.lifecycle ?? "choose stage")}`;
    if (type === "createTask")      return String(data.title ?? "Task title");
    if (type === "updateField")     return `${String(data.column ?? "field")} = ${String(data.value ?? "?")}`;
    if (type === "webhook")         return String(data.url ?? "Webhook URL").slice(0, 28);
    if (type === "grantAcademy")    return String(data.product_name ?? data.product_id ?? "Select a course");
    if (type === "wait")            return minutesToHuman(Number(data.duration_minutes ?? 60));
    if (type === "condition")       return `If ${String(data.field ?? "field")} ${OPERATOR_LABELS[String(data.operator ?? "eq")] ?? "equals"} ${String(data.value ?? "?")}`;
    if (type === "splitAB")         return `A: ${data.pct_a ?? 50}% · B: ${100 - Number(data.pct_a ?? 50)}%`;
    if (type === "goToStep")        return `→ ${String(data.target_label ?? data.target_node ?? "pick a step")}`;
    if (type === "endFlow")         return "End automation";
    return "";
  }

  return (
    <div
      className="min-w-[180px] max-w-[220px] rounded-xl border-2 shadow-lg overflow-hidden"
      style={{ borderColor: meta.color, background: "#1a1a1a" }}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} style={{ background: meta.color }} />}

      <div className="px-3 py-2 flex items-center gap-2" style={{ background: `${meta.color}22` }}>
        <span className="text-sm flex-shrink-0">{meta.icon}</span>
        <span className="text-xs font-bold text-white truncate">{meta.label}</span>
      </div>

      <div className="px-3 py-2 text-[11px] text-white/70 leading-snug min-h-[28px]">
        {previewText()}
      </div>

      {isCondition ? (
        <>
          <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "30%", background: "#22c55e" }} />
          <Handle type="source" position={Position.Bottom} id="no"  style={{ left: "70%", background: "#ef4444" }} />
          <div className="px-3 pb-2 flex justify-between text-[9px] font-bold">
            <span style={{ color: "#22c55e" }}>YES</span>
            <span style={{ color: "#ef4444" }}>NO</span>
          </div>
        </>
      ) : isSplitAB ? (
        <>
          <Handle type="source" position={Position.Bottom} id="a" style={{ left: "30%", background: "#a78bfa" }} />
          <Handle type="source" position={Position.Bottom} id="b" style={{ left: "70%", background: "#7c3aed" }} />
          <div className="px-3 pb-2 flex justify-between text-[9px] font-bold">
            <span style={{ color: "#a78bfa" }}>A</span>
            <span style={{ color: "#7c3aed" }}>B</span>
          </div>
        </>
      ) : type !== "endFlow" ? (
        <Handle type="source" position={Position.Bottom} style={{ background: meta.color }} />
      ) : null}
    </div>
  );
}

const nodeTypes: NodeTypes = Object.fromEntries(
  Object.keys(NODE_META).map(type => [
    type,
    (props: { data: Record<string, unknown> }) => <FlowNode {...props} type={type} />,
  ]),
);

// ── Node config panel ──────────────────────────────────────────────────────

function NodeConfig({ node, onChange, onClose, allNodes }: {
  node: Node;
  onChange: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
  allNodes: Node[];
}) {
  const [local, setLocal] = useState(node.data as Record<string, unknown>);
  const [academyProducts, setAcademyProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [waTemplates, setWaTemplates] = useState<Array<{ id: string; name: string; status: string; components: Array<{ type: string; text?: string }> }>>([]);
  const type = node.type as string;

  function u(key: string, value: unknown) { setLocal(p => ({ ...p, [key]: value })); }
  function apply() { onChange(node.id, local); onClose(); }

  useEffect(() => {
    if (type !== "grantAcademy") return;
    fetch("/api/admin/academy")
      .then(r => r.json())
      .then((d: { products?: Array<{ id: string; name: string }> }) => setAcademyProducts(d.products ?? []))
      .catch(() => {});
  }, [type]);

  useEffect(() => {
    if (type !== "sendWhatsapp") return;
    fetch("/api/admin/crm-settings/whatsapp-templates")
      .then(r => r.ok ? r.json() : { templates: [] })
      .then((d: { templates?: Array<{ id: string; name: string; status: string; components: Array<{ type: string; text?: string }> }> }) => {
        setWaTemplates((d.templates ?? []).filter(t => t.status === "APPROVED"));
      })
      .catch(() => {});
  }, [type]);

  // Wait duration picker state
  const initWait = getWaitParts(Number(node.data.duration_minutes ?? 60));
  const [waitVal,  setWaitVal]  = useState(initWait.value);
  const [waitUnit, setWaitUnit] = useState<"minutes" | "hours" | "days" | "weeks">(initWait.unit);
  function updateWait(val: number, unit: typeof waitUnit) {
    setWaitVal(val);
    setWaitUnit(unit);
    setLocal(p => ({ ...p, duration_minutes: val * UNIT_MINS[unit] }));
  }

  const inp = "w-full px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none focus:border-orange-500";
  const lbl = "text-xs text-white/50 block mb-1";
  const hint = "text-[10px] text-white/25 leading-relaxed mt-1";

  const pctA = Number(local.pct_a ?? 50);
  const pctB = 100 - pctA;

  // Steps available for goToStep (all nodes except triggers and self)
  const steppableNodes = allNodes.filter(n => {
    const t = String(n.type ?? "");
    return n.id !== node.id && t !== "trigger" && !t.startsWith("trigger_");
  });

  const meta = NODE_META[type];

  return (
    <div className="w-80 bg-[#1a1a1a] border-l border-white/10 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{meta?.icon ?? "⚙"}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">{meta?.label ?? type}</h3>
            {meta?.description && (
              <p className="text-[10px] text-white/30 truncate">{meta.description}</p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white text-xl leading-none flex-shrink-0 ml-2">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ── Trigger ── */}
        {type === "trigger" && (() => {
          const allTriggerItems: Array<TriggerItem & { groupLabel: string; groupColor: string }> =
            TRIGGER_GROUPS.flatMap(g => g.items.map(i => ({ ...i, groupLabel: g.label, groupColor: g.color })));
          const currentItem = allTriggerItems.find(i => i.event === String(local.event ?? ""));
          return (
            <>
              <label className={lbl}>What starts this automation?</label>
              <select
                className={inp}
                value={String(local.event ?? "")}
                onChange={e => u("event", e.target.value)}
              >
                <option value="">Choose a trigger…</option>
                {TRIGGER_GROUPS.map(group => (
                  <optgroup key={group.label} label={`── ${group.label}`}>
                    {group.items.map(item => (
                      <option key={item.event} value={item.event}>{item.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {currentItem && (
                <p className={hint}>{currentItem.desc}</p>
              )}
            </>
          );
        })()}

        {/* ── Send Email ── */}
        {type === "sendEmail" && (
          <>
            <label className={lbl}>Subject line</label>
            <input className={inp} value={String(local.subject ?? "")} onChange={e => u("subject", e.target.value)} placeholder="Welcome to Leadash!" />
            <label className={lbl}>From name (optional)</label>
            <input className={inp} value={String(local.from_name ?? "")} onChange={e => u("from_name", e.target.value)} placeholder="Leadash Team" />
            <label className={lbl}>Email body (HTML)</label>
            <textarea rows={7} className={inp} value={String(local.html ?? "")} onChange={e => u("html", e.target.value)} placeholder={"<p>Hi {{full_name}},</p>\n<p>Your access is ready!</p>"} />
            <p className={hint}>Use {"{{full_name}}"}, {"{{email}}"} etc. to personalise the message.</p>
          </>
        )}

        {/* ── Send WhatsApp ── */}
        {type === "sendWhatsapp" && (
          <>
            <label className={lbl}>Template</label>
            <select
              className={inp}
              value={String(local.template_name ?? "")}
              onChange={e => { u("template_name", e.target.value); u("template_params", {}); }}
            >
              <option value="">None — use free-form message below</option>
              {waTemplates.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
            {waTemplates.length === 0 && (
              <p className={hint}>No approved templates yet. Create them in Admin → CRM Settings.</p>
            )}
            {(() => {
              const tmpl = waTemplates.find(t => t.name === String(local.template_name ?? ""));
              if (!tmpl) return null;
              const bodyComp = tmpl.components.find(c => c.type === "BODY");
              const bodyText = bodyComp?.text ?? "";
              const placeholders = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
              const unique = [...new Set(placeholders)];
              return (
                <>
                  {bodyText && (
                    <div className="bg-white/5 border border-white/10 rounded px-2.5 py-2 text-[11px] text-white/50 font-mono leading-relaxed">
                      {bodyText}
                    </div>
                  )}
                  {unique.map(n => (
                    <div key={n}>
                      <label className={lbl}>Value for {`{{${n}}}`}</label>
                      <input
                        className={inp}
                        placeholder={`e.g. John`}
                        value={String((local.template_params as Record<string, string> | undefined)?.[n] ?? "")}
                        onChange={e => u("template_params", { ...(local.template_params as Record<string, string> ?? {}), [n]: e.target.value })}
                      />
                    </div>
                  ))}
                  <p className={hint}>Templates send any time. Values above are static — variable substitution coming soon.</p>
                </>
              );
            })()}
            <label className={lbl}>Free-form message (within 24-hour window only)</label>
            <textarea rows={3} className={inp} value={String(local.body ?? "")} onChange={e => u("body", e.target.value)} placeholder={"Hey {{full_name}}! Your access is ready 🎉"} />
            <p className={hint}>If a template is selected above, it takes priority. The free-form message is only sent when no template is set and the contact messaged within the last 24 hours.</p>
          </>
        )}

        {/* ── Send SMS (coming soon) ── */}
        {type === "sendSms" && (
          <>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs font-semibold text-amber-400">Coming soon</p>
              <p className="text-[10px] text-amber-400/70 mt-0.5">SMS will be available once an SMS provider is connected to your account.</p>
            </div>
            <label className={lbl}>Message (max 160 characters)</label>
            <textarea rows={4} className={inp}
              value={String(local.body ?? "")}
              onChange={e => u("body", e.target.value.slice(0, 160))}
              placeholder="Your access is ready. Visit leadash.com"
              maxLength={160}
            />
            <p className={hint}>{String(local.body ?? "").length} / 160 characters</p>
          </>
        )}

        {/* ── Add to Campaign (coming soon) ── */}
        {type === "enrollCampaign" && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs font-semibold text-amber-400">Coming soon</p>
            <p className="text-[10px] text-amber-400/70 mt-1">This step will automatically add the contact to an outreach email campaign once the feature is ready.</p>
          </div>
        )}

        {/* ── Add / Remove Tag ── */}
        {(type === "addTag" || type === "removeTag") && (
          <>
            <label className={lbl}>{type === "addTag" ? "Tag to add" : "Tag to remove"}</label>
            <input className={inp}
              value={String(local.tag ?? "")}
              onChange={e => u("tag", e.target.value)}
              placeholder="e.g. hot-lead"
            />
            <p className={hint}>Use lowercase with hyphens. Example: <em>hot-lead</em>, <em>paid-customer</em></p>
          </>
        )}

        {/* ── Move Stage (changeLifecycle) ── */}
        {type === "changeLifecycle" && (
          <>
            <label className={lbl}>Move this contact to</label>
            <select className={inp} value={String(local.lifecycle ?? "lead")} onChange={e => u("lifecycle", e.target.value)}>
              <option value="lead">Lead — just entered the funnel</option>
              <option value="prospect">Prospect — showing interest</option>
              <option value="customer">Customer — has purchased</option>
              <option value="churned">Churned — cancelled or gone quiet</option>
              <option value="blocked">Blocked — do not contact</option>
            </select>
          </>
        )}

        {/* ── Create Task ── */}
        {type === "createTask" && (
          <>
            <label className={lbl}>Task title</label>
            <input className={inp}
              value={String(local.title ?? "")}
              onChange={e => u("title", e.target.value)}
              placeholder="Follow up with this contact"
            />
            <label className={lbl}>Due in how many days?</label>
            <input type="number" min={0} className={inp}
              value={String(local.due_days ?? 1)}
              onChange={e => u("due_days", parseInt(e.target.value) || 1)}
            />
            <p className={hint}>The task will appear in the CRM for your team to action.</p>
          </>
        )}

        {/* ── Update Field ── */}
        {type === "updateField" && (
          <>
            <label className={lbl}>Table</label>
            <select className={inp} value={String(local.table ?? "funnel_states")} onChange={e => u("table", e.target.value)}>
              <option value="funnel_states">Funnel states</option>
              <option value="workspaces">Workspace settings</option>
            </select>
            <label className={lbl}>Field name</label>
            <input className={inp} value={String(local.column ?? "")} onChange={e => u("column", e.target.value)} placeholder="current_offer" />
            <label className={lbl}>New value</label>
            <input className={inp} value={String(local.value ?? "")} onChange={e => u("value", e.target.value)} placeholder="bundle_v2" />
            <p className={hint}>Supports {"{{variables}}"} from the trigger payload.</p>
          </>
        )}

        {/* ── Webhook ── */}
        {type === "webhook" && (
          <>
            <label className={lbl}>URL to call</label>
            <input className={inp} value={String(local.url ?? "")} onChange={e => u("url", e.target.value)} placeholder="https://yoursite.com/webhook" />
            <label className={lbl}>Method</label>
            <select className={inp} value={String(local.method ?? "POST")} onChange={e => u("method", e.target.value)}>
              <option value="POST">POST — send data</option>
              <option value="GET">GET — fetch data</option>
              <option value="PUT">PUT — update data</option>
            </select>
          </>
        )}

        {/* ── Grant Course (grantAcademy) ── */}
        {type === "grantAcademy" && (
          <>
            <label className={lbl}>Which course or challenge?</label>
            <select className={inp} value={String(local.product_id ?? "")} onChange={e => {
              const product = academyProducts.find(p => p.id === e.target.value);
              setLocal(p => ({ ...p, product_id: e.target.value, product_name: product?.name ?? "" }));
            }}>
              <option value="">Select a course…</option>
              {academyProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className={hint}>The contact will be enrolled automatically. Skipped if they don't have an account yet.</p>
          </>
        )}

        {/* ── Wait ── */}
        {type === "wait" && (
          <>
            <label className={lbl}>How long should the automation pause?</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                className={`${inp} flex-1`}
                value={waitVal}
                onChange={e => updateWait(parseInt(e.target.value) || 1, waitUnit)}
              />
              <select
                className={`${inp} flex-[1.4]`}
                value={waitUnit}
                onChange={e => updateWait(waitVal, e.target.value as typeof waitUnit)}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
              </select>
            </div>
            <p className={hint}>The flow pauses here and automatically continues after the delay.</p>
          </>
        )}

        {/* ── If / Else (condition) ── */}
        {type === "condition" && (
          <>
            <label className={lbl}>What to check</label>
            <input
              className={inp}
              list="condition-fields"
              value={String(local.field ?? "")}
              onChange={e => u("field", e.target.value)}
              placeholder="payload.total_ngn"
            />
            <datalist id="condition-fields">
              <option value="payload.access_type" />
              <option value="payload.pct_complete" />
              <option value="payload.streak_days" />
              <option value="payload.day" />
              <option value="payload.total_ngn" />
              <option value="payload.product_id" />
            </datalist>
            <p className={hint}>Use <code className="bg-white/10 px-1 rounded">payload.fieldname</code> to check values from the trigger. e.g. payload.total_ngn for purchase amount.</p>

            <label className={lbl}>Condition</label>
            <select className={inp} value={String(local.operator ?? "eq")} onChange={e => u("operator", e.target.value)}>
              {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                <option key={op} value={op}>{label}</option>
              ))}
            </select>

            {!["is_null", "is_not_null"].includes(String(local.operator ?? "eq")) && (
              <>
                <label className={lbl}>Compare to</label>
                <input className={inp} value={String(local.value ?? "")} onChange={e => u("value", e.target.value)} placeholder="50" />
              </>
            )}
            <p className={hint}>Contacts that match go down the YES path; all others take the NO path.</p>
          </>
        )}

        {/* ── A/B Split ── */}
        {type === "splitAB" && (
          <>
            <label className={lbl}>What % of contacts go to Path A?</label>
            <input type="range" min={1} max={99} value={pctA}
              onChange={e => u("pct_a", parseInt(e.target.value))}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-sm font-bold mt-2">
              <span className="text-violet-400">Path A: {pctA}%</span>
              <span className="text-violet-600">Path B: {pctB}%</span>
            </div>
            <p className={hint}>Contacts are split randomly when they reach this step.</p>
          </>
        )}

        {/* ── Jump to Step (goToStep) ── */}
        {type === "goToStep" && (
          <>
            <label className={lbl}>Which step should the automation jump to?</label>
            {steppableNodes.length === 0 ? (
              <p className="text-xs text-white/30 italic">Add more steps to the canvas first, then come back and pick one here.</p>
            ) : (
              <select
                className={inp}
                value={String(local.target_node ?? "")}
                onChange={e => {
                  const targetNode = allNodes.find(n => n.id === e.target.value);
                  const nodeMeta   = targetNode ? NODE_META[String(targetNode.type ?? "")] : null;
                  const lbl2       = nodeMeta?.label ?? String(targetNode?.type ?? "Step");
                  u("target_node", e.target.value);
                  u("target_label", lbl2);
                }}
              >
                <option value="">Select a step…</option>
                {steppableNodes.map(n => {
                  const nodeMeta = NODE_META[String(n.type ?? "")];
                  const nodeLabel = nodeMeta?.label ?? String(n.type ?? "Step");
                  const preview = String((n.data as Record<string, unknown>)?.subject
                    ?? (n.data as Record<string, unknown>)?.title
                    ?? (n.data as Record<string, unknown>)?.tag
                    ?? "");
                  return (
                    <option key={n.id} value={n.id}>
                      {nodeLabel}{preview ? ` — ${preview.slice(0, 24)}` : ""} ({n.id})
                    </option>
                  );
                })}
              </select>
            )}
            <p className={hint}>Use this to loop back, skip ahead, or create branches.</p>
          </>
        )}

        {/* ── End Flow ── */}
        {type === "endFlow" && (
          <div className="p-4 rounded-xl bg-white/5 text-center space-y-2">
            <div className="text-3xl">■</div>
            <p className="text-xs text-white/50">
              The automation stops here. No further steps will run for this contact.
            </p>
          </div>
        )}

      </div>

      <div className="p-4 border-t border-white/10 flex-shrink-0">
        <button onClick={apply} className="w-full bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
          Save changes
        </button>
      </div>
    </div>
  );
}

// ── Step + Trigger Library ─────────────────────────────────────────────────

const DND_KEY = "application/leadash-node";

function LibraryItem({
  icon, label, desc, color, comingSoon, nodeType, nodeData,
}: {
  icon: string; label: string; desc: string; color: string;
  comingSoon?: boolean; nodeType: string; nodeData: Record<string, unknown>;
  onAdd?: () => void;
}) {
  return (
    <div
      draggable={!comingSoon}
      title={desc}
      onDragStart={e => {
        e.dataTransfer.setData(DND_KEY, JSON.stringify({ nodeType, nodeData }));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={`group flex items-start gap-2 px-2 py-2 rounded-lg text-left transition-all cursor-grab active:cursor-grabbing
        ${comingSoon
          ? "opacity-40 cursor-not-allowed"
          : "hover:bg-white/8 hover:shadow-sm"
        }`}
    >
      <span
        className="w-6 h-6 rounded flex items-center justify-center text-xs flex-shrink-0 mt-0.5"
        style={{ background: `${color}30` }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-white/80 group-hover:text-white leading-tight">{label}</span>
          {comingSoon && (
            <span className="text-[8px] font-bold bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
              Soon
            </span>
          )}
        </div>
        <p className="text-[9px] text-white/30 leading-tight mt-0.5 line-clamp-2">{desc}</p>
      </div>
    </div>
  );
}

function SectionHeader({ label, expanded, onToggle }: { label: string; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-2 py-1.5 text-[9px] font-bold text-white/20 uppercase tracking-widest hover:text-white/40 transition-colors"
    >
      {label}
      <span>{expanded ? "▾" : "▸"}</span>
    </button>
  );
}

function StepLibrary({
  onAddNode,
  isOpen,
  onToggle,
}: {
  onAddNode: (type: string, data?: Record<string, unknown>) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    triggers:      true,
    "User Events": true,
    Academy:       false,
    "Offers & Billing": false,
    CRM:           false,
    Communication: true,
    "CRM steps":   true,
    "Academy steps": false,
    Logic:         true,
    Advanced:      false,
  });

  function toggle(key: string) { setExpanded(p => ({ ...p, [key]: !p[key] })); }

  const q = search.toLowerCase().trim();

  // Flat search across triggers + steps
  if (q) {
    const triggerHits = TRIGGER_GROUPS.flatMap(g =>
      g.items
        .filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q))
        .map(i => ({ kind: "trigger" as const, ...i, groupColor: g.color })),
    );
    const stepHits = Object.entries(NODE_META)
      .filter(([t, m]) => t !== "trigger" && (m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)))
      .map(([t, m]) => ({ kind: "step" as const, type: t, ...m }));

    return (
      <div className="flex-shrink-0 border-r border-white/10 bg-[#111] flex flex-col overflow-hidden" style={{ width: 256 }}>
        <div className="px-2 pt-2 pb-1">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full px-2 py-1.5 text-[11px] bg-white/5 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-1 pb-2">
          {triggerHits.length === 0 && stepHits.length === 0 ? (
            <p className="text-[10px] text-white/20 px-2 py-6 text-center">No results for "{search}"</p>
          ) : (
            <>
              {triggerHits.length > 0 && (
                <div className="mb-1">
                  <p className="text-[8px] font-bold text-white/15 uppercase tracking-widest px-2 py-1">Triggers</p>
                  {triggerHits.map(i => (
                    <LibraryItem key={i.event} icon="⚡" label={i.label} desc={i.desc} color={i.groupColor}
                      nodeType="trigger" nodeData={{ event: i.event }}
                    />
                  ))}
                </div>
              )}
              {stepHits.length > 0 && (
                <div>
                  <p className="text-[8px] font-bold text-white/15 uppercase tracking-widest px-2 py-1">Steps</p>
                  {stepHits.map(s => (
                    <LibraryItem key={s.type} icon={s.icon} label={s.label} desc={s.description}
                      color={s.color} comingSoon={s.comingSoon}
                      nodeType={s.type} nodeData={{}}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-shrink-0 border-r border-white/10 bg-[#111] flex flex-col transition-all duration-200 overflow-hidden"
      style={{ width: isOpen ? 256 : 36 }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center w-9 h-9 text-white/30 hover:text-white/70 flex-shrink-0 self-end mt-1"
        title={isOpen ? "Collapse panel" : "Expand library"}
      >
        {isOpen ? "‹" : "›"}
      </button>

      {isOpen && (
        <>
          {/* Search */}
          <div className="px-2 pb-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search triggers & steps…"
              className="w-full px-2 py-1.5 text-[11px] bg-white/5 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ── Triggers section ── */}
            <div className="border-b border-white/5 pb-1 mb-1">
              <SectionHeader label="Triggers" expanded={!!expanded.triggers} onToggle={() => toggle("triggers")} />
              {expanded.triggers && (
                <div className="px-1 space-y-0">
                  {TRIGGER_GROUPS.map(group => (
                    <div key={group.label}>
                      {/* Sub-group header */}
                      <button
                        onClick={() => toggle(group.label)}
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-white/30 hover:text-white/50 transition-colors"
                      >
                        <span>{group.icon}</span>
                        <span>{group.label}</span>
                        <span className="ml-auto text-[8px]">{expanded[group.label] ? "▾" : "▸"}</span>
                      </button>
                      {expanded[group.label] && (
                        <div className="ml-1">
                          {group.items.map(item => (
                            <LibraryItem
                              key={item.event}
                              icon="⚡"
                              label={item.label}
                              desc={item.desc}
                              color={group.color}
                              nodeType="trigger"
                              nodeData={{ event: item.event }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Steps section ── */}
            <div className="px-1">
              <p className="text-[8px] font-bold text-white/15 uppercase tracking-widest px-2 py-1.5">Steps</p>
              {STEP_CATEGORIES.map(cat => {
                const stepsInCat = Object.entries(NODE_META).filter(([, m]) => m.category === cat);
                if (stepsInCat.length === 0) return null;
                const catKey = cat === "CRM" ? "CRM steps" : cat === "Academy" ? "Academy steps" : cat;
                return (
                  <div key={cat}>
                    <SectionHeader label={cat} expanded={!!expanded[catKey]} onToggle={() => toggle(catKey)} />
                    {expanded[catKey] && (
                      <div className="pb-1">
                        {stepsInCat.map(([type, meta]) => (
                          <LibraryItem
                            key={type}
                            icon={meta.icon}
                            label={meta.label}
                            desc={meta.description}
                            color={meta.color}
                            comingSoon={meta.comingSoon}
                            nodeType={type}
                            nodeData={{}}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-white/5 flex-shrink-0">
            <p className="text-[9px] text-white/15 text-center">Click or drag onto canvas</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Duplicate policy selector ──────────────────────────────────────────────

const DUP_POLICY_OPTIONS: Array<{
  value: "deduplicate" | "parallel" | "restart";
  label: string;
  description: string;
}> = [
  { value: "deduplicate", label: "Skip",           description: "Don't start a new run (recommended)" },
  { value: "restart",     label: "Restart",         description: "Cancel current run, start fresh" },
  { value: "parallel",    label: "Allow parallel",  description: "Run multiple instances at once" },
];

function DupPolicySelector({
  value,
  onChange,
}: {
  value: "deduplicate" | "parallel" | "restart";
  onChange: (v: "deduplicate" | "parallel" | "restart") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Element)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = DUP_POLICY_OPTIONS.find(o => o.value === value)!;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] text-white/60 hover:text-white transition-all"
        title="What to do if a contact re-triggers this automation while already in it"
      >
        <span className="font-semibold">{current.label}</span>
        <span className="text-white/20">▾</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-72 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-3">
          <p className="text-[10px] text-white/30 mb-2">
            What happens if a contact triggers this automation while already in it?
          </p>
          <div className="space-y-1">
            {DUP_POLICY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg transition-all text-left ${
                  value === opt.value ? "bg-orange-500/10 border border-orange-500/30" : "hover:bg-white/5 border border-transparent"
                }`}
              >
                <span className={`mt-0.5 w-3 h-3 rounded-full border flex-shrink-0 flex items-center justify-center ${
                  value === opt.value ? "border-orange-500 bg-orange-500" : "border-white/30"
                }`}>
                  {value === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                <div>
                  <p className="text-xs font-semibold text-white">{opt.label}</p>
                  <p className="text-[10px] text-white/40">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── History helpers ────────────────────────────────────────────────────────

const HISTORY_LIMIT = 30;

let _nodeId = 1;
function nextId() { return `node_${_nodeId++}`; }

// ── Main builder ───────────────────────────────────────────────────────────

function AutomationBuilderInner() {
  const params  = useSearchParams();
  const router  = useRouter();
  const flowId  = params.get("id");
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flowName,      setFlowName]    = useState("New Flow");
  const [isActive,      setIsActive]    = useState(false);
  const [dupPolicy,     setDupPolicy]   = useState<"deduplicate"|"parallel"|"restart">("deduplicate");
  const [forceMigrate,  setForceMigrate]= useState(false);
  const [selectedNode,  setSelectedNode]= useState<Node | null>(null);
  const [saving,        setSaving]      = useState(false);
  const [saved,         setSaved]       = useState(false);
  const [loading,       setLoading]     = useState(true);
  const [libraryOpen,   setLibraryOpen] = useState(true);

  // Undo/redo history
  const historyRef  = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const histIdxRef  = useRef(-1);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyLen,   setHistoryLen]   = useState(0);
  const skipSnapshot = useRef(false);

  function snapshot(ns: Node[], es: Edge[]) {
    if (skipSnapshot.current) return;
    const base = historyRef.current.slice(0, histIdxRef.current + 1);
    const next = [...base, { nodes: ns, edges: es }].slice(-HISTORY_LIMIT);
    historyRef.current = next;
    histIdxRef.current = next.length - 1;
    setHistoryIndex(next.length - 1);
    setHistoryLen(next.length);
  }

  function undo() {
    const idx = histIdxRef.current - 1;
    if (idx < 0) return;
    skipSnapshot.current = true;
    const snap = historyRef.current[idx];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    histIdxRef.current = idx;
    setHistoryIndex(idx);
    requestAnimationFrame(() => { skipSnapshot.current = false; });
  }

  function redo() {
    const idx = histIdxRef.current + 1;
    if (idx >= historyRef.current.length) return;
    skipSnapshot.current = true;
    const snap = historyRef.current[idx];
    setNodes(snap.nodes);
    setEdges(snap.edges);
    histIdxRef.current = idx;
    setHistoryIndex(idx);
    requestAnimationFrame(() => { skipSnapshot.current = false; });
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load existing flow
  useEffect(() => {
    if (!flowId) { setLoading(false); return; }
    fetch("/api/admin/automations")
      .then(r => r.json())
      .then((d: { flows?: Array<{ id: string; name: string; is_active: boolean; duplicate_policy: string; flow_definition: { nodes: Node[]; edges: Edge[] } }> }) => {
        const flow = d.flows?.find(f => f.id === flowId);
        if (flow) {
          setFlowName(flow.name);
          setIsActive(flow.is_active);
          setDupPolicy(flow.duplicate_policy as typeof dupPolicy);
          if (flow.flow_definition?.nodes?.length) {
            const ns = flow.flow_definition.nodes;
            const es = flow.flow_definition.edges ?? [];
            setNodes(ns);
            setEdges(es);
            historyRef.current = [{ nodes: ns, edges: es }];
            histIdxRef.current = 0;
            setHistoryIndex(0);
            setHistoryLen(1);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(eds => {
        const next = addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds);
        setNodes(ns => { snapshot(ns, next); return ns; });
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setEdges, setNodes],
  );

  function addNodeAt(type: string, data: Record<string, unknown>, position: { x: number; y: number }) {
    const id = nextId();
    const newNode: Node = { id, type, position, data };
    setNodes(nds => {
      const next = [...nds, newNode];
      snapshot(next, edges);
      return next;
    });
  }

  function addNode(type: string, data: Record<string, unknown> = {}) {
    addNodeAt(type, data, { x: 220 + Math.random() * 60, y: 100 + nodes.length * 150 });
  }

  // Drag-and-drop from library onto canvas
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DND_KEY);
    if (!raw) return;
    try {
      const { nodeType, nodeData } = JSON.parse(raw) as { nodeType: string; nodeData: Record<string, unknown> };
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNodeAt(nodeType, nodeData, position);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenToFlowPosition, nodes, edges]);

  function onNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNode(node);
  }

  function updateNodeData(id: string, data: Record<string, unknown>) {
    setNodes(nds => {
      const next = nds.map(n => n.id === id ? { ...n, data } : n);
      snapshot(next, edges);
      return next;
    });
    // Keep selectedNode in sync so the panel re-renders immediately
    setSelectedNode((prev: Node | null) => prev?.id === id ? { ...prev, data } : prev);
  }

  async function save(andActivate?: boolean) {
    if (!flowId) return;
    setSaving(true);
    setSaved(false);

    const patch: Record<string, unknown> = {
      name:             flowName,
      flow_definition:  { nodes, edges },
      duplicate_policy: dupPolicy,
      force_migrate_executions: forceMigrate,
    };
    if (andActivate != null) patch.is_active = andActivate;

    await fetch(`/api/admin/automations?id=${flowId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });

    setSaving(false);
    setSaved(true);
    if (andActivate != null) setIsActive(andActivate);
    setTimeout(() => setSaved(false), 2500);
  }

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyLen - 1;

  if (loading) {
    return (
      <div className="h-full min-h-screen bg-[#0c0c0f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-screen bg-[#0c0c0f] flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-[#111] flex-shrink-0 flex-wrap">
        <button onClick={() => router.push("/admin/automations")} className="text-white/30 hover:text-white/70 text-sm flex-shrink-0">
          ← Automations
        </button>
        <div className="h-4 w-px bg-white/10" />
        <input
          value={flowName}
          onChange={e => setFlowName(e.target.value)}
          className="bg-transparent text-white text-sm font-semibold focus:outline-none w-48 border-b border-transparent focus:border-orange-500"
        />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-all ${canUndo ? "text-white/60 hover:text-white hover:bg-white/10" : "text-white/15 cursor-not-allowed"}`}>
            ↩
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-all ${canRedo ? "text-white/60 hover:text-white hover:bg-white/10" : "text-white/15 cursor-not-allowed"}`}>
            ↪
          </button>
        </div>

        <DupPolicySelector value={dupPolicy} onChange={setDupPolicy} />

        <label className="flex items-center gap-1.5 text-[10px] text-white/30 cursor-pointer">
          <input type="checkbox" checked={forceMigrate} onChange={e => setForceMigrate(e.target.checked)} className="accent-orange-500" />
          Migrate running
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => save()}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              saved ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50"
            }`}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save draft"}
          </button>
          <button
            onClick={() => save(!isActive)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              isActive
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "bg-emerald-500 text-white hover:bg-emerald-400"
            }`}
          >
            {isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: library */}
        <StepLibrary
          onAddNode={addNode}
          isOpen={libraryOpen}
          onToggle={() => setLibraryOpen(o => !o)}
        />

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#4b5563" } }}
          >
            <Background color="#333" gap={20} />
            <Controls />
            <MiniMap nodeColor={n => NODE_META[n.type as string]?.color ?? "#6b7280"} style={{ background: "#111" }} />
          </ReactFlow>

          {/* Empty state hint */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-white/15 text-sm font-semibold">Drag a trigger from the left panel to start</p>
                <p className="text-white/10 text-xs mt-1">or click any item in the library to add it</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: node config panel — key forces remount on node change */}
        {selectedNode && (
          <NodeConfig
            key={selectedNode.id}
            node={selectedNode}
            onChange={updateNodeData}
            onClose={() => setSelectedNode(null)}
            allNodes={nodes}
          />
        )}
      </div>
    </div>
  );
}

export default function AutomationBuilderPage() {
  return (
    <Suspense>
      <ReactFlowProvider>
        <AutomationBuilderInner />
      </ReactFlowProvider>
    </Suspense>
  );
}
