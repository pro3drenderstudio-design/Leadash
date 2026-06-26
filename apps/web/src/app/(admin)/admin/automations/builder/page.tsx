"use client";
import { useCallback, useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Node type definitions ──────────────────────────────────────────────────

const NODE_META: Record<string, { label: string; color: string; icon: string; category: string }> = {
  // Triggers
  trigger:                       { label: "Trigger",             color: "#8b5cf6", icon: "⚡", category: "Triggers" },
  trigger_funnel_optin:          { label: "Funnel Optin",        color: "#8b5cf6", icon: "⚡", category: "Triggers" },
  trigger_funnel_purchase:       { label: "Purchase Completed",  color: "#8b5cf6", icon: "⚡", category: "Triggers" },
  trigger_billing_payment_failed:{ label: "Payment Failed",      color: "#ef4444", icon: "⚡", category: "Triggers" },
  trigger_billing_trial_ending:  { label: "Trial Ending",        color: "#f59e0b", icon: "⚡", category: "Triggers" },
  trigger_academy_inactivity:    { label: "Academy Inactivity",  color: "#8b5cf6", icon: "⚡", category: "Triggers" },
  trigger_crm_tag_added:         { label: "Tag Added",           color: "#8b5cf6", icon: "⚡", category: "Triggers" },

  // Communication
  sendEmail:                     { label: "Send Email",          color: "#f97316", icon: "✉",  category: "Communication" },
  sendWhatsapp:                  { label: "Send WhatsApp",       color: "#22c55e", icon: "💬", category: "Communication" },
  sendSms:                       { label: "Send SMS",            color: "#14b8a6", icon: "📱", category: "Communication" },
  enrollCampaign:                { label: "Enroll in Campaign",  color: "#f97316", icon: "📧", category: "Communication" },

  // CRM
  addTag:                        { label: "Add Tag",             color: "#64748b", icon: "🏷",  category: "CRM" },
  removeTag:                     { label: "Remove Tag",          color: "#64748b", icon: "🏷",  category: "CRM" },
  changeLifecycle:               { label: "Change Lifecycle",    color: "#64748b", icon: "👤", category: "CRM" },
  createTask:                    { label: "Create Task",         color: "#64748b", icon: "✓",  category: "CRM" },
  updateField:                   { label: "Update Field",        color: "#64748b", icon: "✏",  category: "CRM" },
  webhook:                       { label: "Webhook",             color: "#ec4899", icon: "🔗", category: "CRM" },
  triggerWebhook:                { label: "Trigger Webhook",     color: "#ec4899", icon: "🔗", category: "CRM" },

  // Academy
  grantAcademy:                  { label: "Grant Academy Access",color: "#6366f1", icon: "🎓", category: "Academy" },

  // Logic
  wait:                          { label: "Wait",                color: "#3b82f6", icon: "⏳", category: "Logic" },
  condition:                     { label: "Condition",           color: "#eab308", icon: "?",  category: "Logic" },
  splitAB:                       { label: "A/B Split",           color: "#7c3aed", icon: "🔀", category: "Logic" },
  goToStep:                      { label: "Go to Step",          color: "#6b7280", icon: "↗",  category: "Logic" },
  endFlow:                       { label: "End",                 color: "#6b7280", icon: "■",  category: "Logic" },
};

const CATEGORIES = ["Triggers", "Communication", "CRM", "Academy", "Logic"] as const;

// ── Flow Node component ────────────────────────────────────────────────────

function FlowNode({ data, type }: { data: Record<string, unknown>; type: string }) {
  const meta = NODE_META[type] ?? { label: type, color: "#6b7280", icon: "•" };
  const isCondition = type === "condition";
  const isSplitAB   = type === "splitAB";
  const isTrigger   = type.startsWith("trigger");

  function previewText() {
    if (type === "trigger")                        return String(data.event ?? "Event trigger");
    if (type === "trigger_funnel_optin")           return "When a contact opts in";
    if (type === "trigger_funnel_purchase")        return "When purchase is completed";
    if (type === "trigger_billing_payment_failed") return `Attempt ${String(data.attempt ?? "any")}`;
    if (type === "trigger_billing_trial_ending")   return `${String(data.days_before ?? 3)} days before`;
    if (type === "trigger_academy_inactivity")     return `${String(data.inactivity_days ?? 7)} days inactive`;
    if (type === "trigger_crm_tag_added")          return String(data.tag ?? "Any tag");
    if (type === "sendEmail")                      return String(data.subject ?? "Email subject");
    if (type === "sendWhatsapp")                   return String(data.template_name ?? data.body ?? "WhatsApp message");
    if (type === "sendSms")                        return String(data.body ?? "SMS body");
    if (type === "enrollCampaign")                 return "Enroll in campaign";
    if (type === "addTag")                         return `Tag: ${String(data.tag ?? "?")}`;
    if (type === "removeTag")                      return `Remove: ${String(data.tag ?? "?")}`;
    if (type === "changeLifecycle")                return `→ ${String(data.lifecycle ?? "?")}`;
    if (type === "createTask")                     return String(data.title ?? "Task title");
    if (type === "updateField")                    return `Set ${String(data.table ?? "?")} · ${String(data.column ?? "?")}`;
    if (type === "webhook" || type === "triggerWebhook") return String(data.url ?? "Webhook URL").slice(0, 28);
    if (type === "grantAcademy")                   return `Access: ${String(data.access_type ?? "?")}`;
    if (type === "wait")                           return `${String(data.duration_minutes ?? "?")} minutes`;
    if (type === "condition")                      return `${String(data.field ?? "?")} ${String(data.operator ?? "eq")} ${String(data.value ?? "?")}`;
    if (type === "splitAB")                        return `A: ${String(data.pct_a ?? 50)}% / B: ${String(100 - Number(data.pct_a ?? 50))}%`;
    if (type === "goToStep")                       return `→ ${String(data.target_node ?? "step")}`;
    if (type === "endFlow")                        return "End automation";
    return "";
  }

  return (
    <div
      className="min-w-[160px] rounded-xl border-2 shadow-lg overflow-hidden"
      style={{ borderColor: meta.color, background: "#1a1a1a" }}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} style={{ background: meta.color }} />}

      <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: `${meta.color}22` }}>
        <span className="text-sm">{meta.icon}</span>
        <span className="text-xs font-bold text-white">{meta.label}</span>
      </div>

      <div className="px-3 py-2 text-[11px] text-white/60">
        <span>{previewText()}</span>
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

function NodeConfig({ node, onChange, onClose }: {
  node: Node;
  onChange: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState(node.data as Record<string, unknown>);
  const type = node.type as string;

  function u(key: string, value: unknown) { setLocal(p => ({ ...p, [key]: value })); }
  function apply() { onChange(node.id, local); onClose(); }

  const inp = "w-full px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none focus:border-orange-500";
  const lbl = "text-xs text-white/50 block mb-1";

  const pctA = Number(local.pct_a ?? 50);
  const pctB = 100 - pctA;

  return (
    <div className="w-72 bg-[#1a1a1a] border-l border-white/10 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-bold text-white">{NODE_META[type]?.label ?? type}</h3>
        <button onClick={onClose} className="text-white/30 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ── Triggers ── */}
        {type === "trigger" && (
          <>
            <label className={lbl}>Event name</label>
            <input className={inp} value={String(local.event ?? "")} onChange={e => u("event", e.target.value)} placeholder="user.opted_in" />
          </>
        )}

        {type === "trigger_funnel_optin" && (
          <p className="text-xs text-white/40">Fires when a contact submits a funnel opt-in form.</p>
        )}

        {type === "trigger_funnel_purchase" && (
          <p className="text-xs text-white/40">Fires when a contact completes a purchase in the funnel.</p>
        )}

        {type === "trigger_billing_payment_failed" && (
          <>
            <p className="text-xs text-white/40 mb-2">Fires when a billing payment attempt fails.</p>
            <label className={lbl}>Attempt number (1–3, blank = any)</label>
            <input type="number" min={1} max={3} className={inp}
              value={String(local.attempt ?? "")}
              onChange={e => u("attempt", e.target.value ? parseInt(e.target.value) : "")}
              placeholder="Any attempt"
            />
          </>
        )}

        {type === "trigger_billing_trial_ending" && (
          <>
            <p className="text-xs text-white/40 mb-2">Fires N days before a trial period ends.</p>
            <label className={lbl}>Days before trial ends</label>
            <input type="number" min={1} className={inp}
              value={String(local.days_before ?? 3)}
              onChange={e => u("days_before", parseInt(e.target.value) || 3)}
            />
          </>
        )}

        {type === "trigger_academy_inactivity" && (
          <>
            <p className="text-xs text-white/40 mb-2">Fires when a contact has not engaged with the Academy for N days.</p>
            <label className={lbl}>Days of inactivity</label>
            <input type="number" min={1} className={inp}
              value={String(local.inactivity_days ?? 7)}
              onChange={e => u("inactivity_days", parseInt(e.target.value) || 7)}
            />
          </>
        )}

        {type === "trigger_crm_tag_added" && (
          <>
            <p className="text-xs text-white/40 mb-2">Fires when a specific tag is added to a contact.</p>
            <label className={lbl}>Tag name (blank = any tag)</label>
            <input className={inp}
              value={String(local.tag ?? "")}
              onChange={e => u("tag", e.target.value)}
              placeholder="e.g. hot-lead"
            />
          </>
        )}

        {/* ── Communication ── */}
        {type === "sendEmail" && (
          <>
            <label className={lbl}>To (variable or email)</label>
            <input className={inp} value={String(local.to ?? "")} onChange={e => u("to", e.target.value)} placeholder="{{email}}" />
            <label className={lbl}>Subject</label>
            <input className={inp} value={String(local.subject ?? "")} onChange={e => u("subject", e.target.value)} placeholder="Welcome to Leadash" />
            <label className={lbl}>From name (optional)</label>
            <input className={inp} value={String(local.from_name ?? "")} onChange={e => u("from_name", e.target.value)} placeholder="Leadash Team" />
            <label className={lbl}>HTML body</label>
            <textarea rows={6} className={inp} value={String(local.html ?? "")} onChange={e => u("html", e.target.value)} placeholder="<p>Hello {{full_name}}</p>" />
          </>
        )}

        {type === "sendWhatsapp" && (
          <>
            <label className={lbl}>Template name (leave blank for free-form)</label>
            <input className={inp} value={String(local.template_name ?? "")} onChange={e => u("template_name", e.target.value)} placeholder="welcome_sequence" />
            <label className={lbl}>Free-form body (only within 24hr window)</label>
            <textarea rows={4} className={inp} value={String(local.body ?? "")} onChange={e => u("body", e.target.value)} placeholder="Hey {{full_name}}, your access is ready!" />
          </>
        )}

        {type === "sendSms" && (
          <>
            <p className="text-[10px] text-amber-400/70 mb-2">Requires SMS channel to be configured.</p>
            <label className={lbl}>SMS body</label>
            <textarea rows={4} className={inp}
              value={String(local.body ?? "")}
              onChange={e => u("body", e.target.value.slice(0, 160))}
              placeholder="Your access is ready. Click here: {{link}}"
              maxLength={160}
            />
            <p className="text-[10px] text-white/30">{String(local.body ?? "").length}/160 characters</p>
          </>
        )}

        {type === "enrollCampaign" && (
          <p className="text-xs text-white/40">Campaign enrollment coming soon. This node will enroll the contact into the selected campaign when the feature launches.</p>
        )}

        {/* ── CRM ── */}
        {(type === "addTag" || type === "removeTag") && (
          <>
            <label className={lbl}>{type === "addTag" ? "Tag to add" : "Tag to remove"}</label>
            <input className={inp}
              value={String(local.tag ?? "")}
              onChange={e => u("tag", e.target.value)}
              placeholder="e.g. hot-lead"
            />
          </>
        )}

        {type === "changeLifecycle" && (
          <>
            <label className={lbl}>New lifecycle stage</label>
            <select className={inp} value={String(local.lifecycle ?? "lead")} onChange={e => u("lifecycle", e.target.value)}>
              <option value="lead">Lead</option>
              <option value="prospect">Prospect</option>
              <option value="customer">Customer</option>
              <option value="churned">Churned</option>
            </select>
          </>
        )}

        {type === "createTask" && (
          <>
            <label className={lbl}>Task title</label>
            <input className={inp}
              value={String(local.title ?? "")}
              onChange={e => u("title", e.target.value)}
              placeholder="Follow up with contact"
            />
            <label className={lbl}>Due in (days)</label>
            <input type="number" min={0} className={inp}
              value={String(local.due_days ?? 1)}
              onChange={e => u("due_days", parseInt(e.target.value) || 1)}
            />
            <p className="text-[10px] text-white/30">Leave assignee blank to create unassigned.</p>
          </>
        )}

        {type === "updateField" && (
          <>
            <label className={lbl}>Table</label>
            <select className={inp} value={String(local.table ?? "funnel_states")} onChange={e => u("table", e.target.value)}>
              <option value="funnel_states">funnel_states</option>
              <option value="workspaces">workspaces</option>
            </select>
            <label className={lbl}>Column</label>
            <input className={inp} value={String(local.column ?? "")} onChange={e => u("column", e.target.value)} placeholder="current_offer" />
            <label className={lbl}>Value (supports {"{{variables}}"})</label>
            <input className={inp} value={String(local.value ?? "")} onChange={e => u("value", e.target.value)} placeholder="bundle" />
          </>
        )}

        {(type === "webhook" || type === "triggerWebhook") && (
          <>
            <label className={lbl}>URL</label>
            <input className={inp} value={String(local.url ?? "")} onChange={e => u("url", e.target.value)} placeholder="https://your-webhook.com/hook" />
            <label className={lbl}>Method</label>
            <select className={inp} value={String(local.method ?? "POST")} onChange={e => u("method", e.target.value)}>
              <option>POST</option><option>GET</option><option>PUT</option>
            </select>
          </>
        )}

        {/* ── Academy ── */}
        {type === "grantAcademy" && (
          <>
            <label className={lbl}>Access type</label>
            <select className={inp} value={String(local.access_type ?? "challenge")} onChange={e => u("access_type", e.target.value)}>
              <option value="challenge">Challenge</option>
              <option value="bundle">Bundle</option>
            </select>
          </>
        )}

        {/* ── Logic ── */}
        {type === "wait" && (
          <>
            <label className={lbl}>Wait duration (minutes)</label>
            <input type="number" className={inp} value={String(local.duration_minutes ?? 60)} onChange={e => u("duration_minutes", parseInt(e.target.value) || 60)} min={1} />
            <p className="text-[10px] text-white/30">The execution pauses here and re-queues when the delay expires.</p>
          </>
        )}

        {type === "condition" && (
          <>
            <label className={lbl}>Field (e.g. funnel_state.day1_completed_at)</label>
            <input className={inp} value={String(local.field ?? "")} onChange={e => u("field", e.target.value)} placeholder="payload.pct" />
            <label className={lbl}>Operator</label>
            <select className={inp} value={String(local.operator ?? "eq")} onChange={e => u("operator", e.target.value)}>
              {["eq","neq","gt","lt","gte","lte","contains","not_contains","is_null","is_not_null"].map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            <label className={lbl}>Value</label>
            <input className={inp} value={String(local.value ?? "")} onChange={e => u("value", e.target.value)} placeholder="50" />
          </>
        )}

        {type === "splitAB" && (
          <>
            <label className={lbl}>Split percentage</label>
            <input type="range" min={1} max={99} value={pctA}
              onChange={e => u("pct_a", parseInt(e.target.value))}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-xs font-semibold mt-1">
              <span className="text-violet-400">A: {pctA}%</span>
              <span className="text-violet-600">B: {pctB}%</span>
            </div>
          </>
        )}

        {type === "goToStep" && (
          <>
            <label className={lbl}>Target node ID</label>
            <input className={inp}
              value={String(local.target_node ?? "")}
              onChange={e => u("target_node", e.target.value)}
              placeholder="node_5"
            />
            <p className="text-[10px] text-white/30">Enter the node ID from the canvas (visible in node tooltips).</p>
          </>
        )}

        {type === "endFlow" && (
          <p className="text-xs text-white/40">This will end the automation for this contact. No further steps will be executed.</p>
        )}

      </div>

      <div className="p-4 border-t border-white/10">
        <button onClick={apply} className="w-full bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
          Apply
        </button>
      </div>
    </div>
  );
}

// ── Step Library Panel ─────────────────────────────────────────────────────

function StepLibrary({
  onAddNode,
  isOpen,
  onToggle,
}: {
  onAddNode: (type: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    Triggers: true,
    Communication: true,
    CRM: false,
    Academy: false,
    Logic: true,
  });

  const filtered = search.trim()
    ? Object.entries(NODE_META).filter(([, m]) =>
        m.label.toLowerCase().includes(search.toLowerCase())
      )
    : null;

  return (
    <div
      className="flex-shrink-0 border-r border-white/10 bg-[#111] flex flex-col transition-all duration-200 overflow-hidden"
      style={{ width: isOpen ? 200 : 36 }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center w-9 h-9 text-white/30 hover:text-white/70 flex-shrink-0 self-end mt-1 mr-0"
        title={isOpen ? "Collapse panel" : "Expand step library"}
      >
        {isOpen ? "‹" : "›"}
      </button>

      {isOpen && (
        <>
          <div className="px-2 pb-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-[11px] bg-white/5 border border-white/10 rounded text-white placeholder-white/30 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered ? (
              // Search results flat list
              <div className="px-1.5 space-y-0.5">
                {filtered.map(([type, meta]) => (
                  <button
                    key={type}
                    onClick={() => onAddNode(type)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all"
                  >
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-[10px] flex-shrink-0"
                      style={{ background: `${meta.color}33` }}
                    >
                      {meta.icon}
                    </span>
                    {meta.label}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-[10px] text-white/20 px-2 py-4 text-center">No results</p>
                )}
              </div>
            ) : (
              // Categorised list
              CATEGORIES.map(cat => {
                const nodes = Object.entries(NODE_META).filter(([, m]) => m.category === cat);
                return (
                  <div key={cat}>
                    <button
                      onClick={() => setExpanded(p => ({ ...p, [cat]: !p[cat] }))}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] font-bold text-white/20 uppercase tracking-widest hover:text-white/40 transition-colors"
                    >
                      {cat}
                      <span>{expanded[cat] ? "▾" : "▸"}</span>
                    </button>
                    {expanded[cat] && (
                      <div className="px-1.5 space-y-0.5 pb-1">
                        {nodes.map(([type, meta]) => (
                          <button
                            key={type}
                            onClick={() => onAddNode(type)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all"
                          >
                            <span
                              className="w-5 h-5 rounded flex items-center justify-center text-[10px] flex-shrink-0"
                              style={{ background: `${meta.color}33` }}
                            >
                              {meta.icon}
                            </span>
                            {meta.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
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
  {
    value: "deduplicate",
    label: "Skip",
    description: "Don't start a new run (recommended)",
  },
  {
    value: "restart",
    label: "Restart",
    description: "Cancel current run, start fresh",
  },
  {
    value: "parallel",
    label: "Allow parallel",
    description: "Run multiple instances simultaneously",
  },
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
        title="When a contact re-triggers this automation while already in it"
      >
        <span className="font-semibold">{current.label}</span>
        <span className="text-white/20">▾</span>
        <span
          className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[9px] text-white/30 hover:text-white/60 ml-0.5"
          title="When a contact re-triggers this automation while already in it"
        >
          ?
        </span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-72 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-3">
          <p className="text-[10px] text-white/30 mb-2">
            When a contact re-triggers this automation while already in it:
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

// ── History snapshot helpers ───────────────────────────────────────────────

const HISTORY_LIMIT = 30;

// ── Main builder ───────────────────────────────────────────────────────────

let _nodeId = 1;
function nextId() { return `node_${_nodeId++}`; }

function AutomationBuilderInner() {
  const params  = useSearchParams();
  const router  = useRouter();
  const flowId  = params.get("id");

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

  // Undo/redo history — use refs so callbacks always see fresh values
  const historyRef  = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const histIdxRef  = useRef(-1);
  const [historyIndex, setHistoryIndex] = useState(-1); // drives button disabled state
  const [historyLen,   setHistoryLen]   = useState(0);
  // Prevent recording history while we're replaying it
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

  // Keyboard shortcuts for undo/redo
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
            // Seed initial history
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
        // edges snapshot is deferred so nodes is still current
        setNodes(ns => { snapshot(ns, next); return ns; });
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setEdges, setNodes],
  );

  function addNode(type: string) {
    const id = nextId();
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 80, y: 100 + nodes.length * 140 },
      data: {},
    };
    setNodes(nds => {
      const next = [...nds, newNode];
      snapshot(next, edges);
      return next;
    });
  }

  function onNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNode(node);
  }

  function updateNodeData(id: string, data: Record<string, unknown>) {
    setNodes(nds => {
      const next = nds.map(n => n.id === id ? { ...n, data } : n);
      snapshot(next, edges);
      return next;
    });
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
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-all ${
              canUndo ? "text-white/60 hover:text-white hover:bg-white/10" : "text-white/15 cursor-not-allowed"
            }`}
          >
            ↩
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-all ${
              canRedo ? "text-white/60 hover:text-white hover:bg-white/10" : "text-white/15 cursor-not-allowed"
            }`}
          >
            ↪
          </button>
        </div>

        {/* Duplicate policy */}
        <DupPolicySelector value={dupPolicy} onChange={setDupPolicy} />

        {/* Force migrate toggle */}
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
        {/* Left: Step Library */}
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
            nodeTypes={nodeTypes}
            fitView
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#4b5563" } }}
          >
            <Background color="#333" gap={20} />
            <Controls />
            <MiniMap nodeColor={n => NODE_META[n.type as string]?.color ?? "#6b7280"} style={{ background: "#111" }} />
          </ReactFlow>
        </div>

        {/* Right: node config panel */}
        {selectedNode && (
          <NodeConfig
            node={selectedNode}
            onChange={updateNodeData}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function AutomationBuilderPage() {
  return (
    <Suspense>
      <AutomationBuilderInner />
    </Suspense>
  );
}
