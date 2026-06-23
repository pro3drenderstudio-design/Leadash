"use client";
import { useCallback, useEffect, useState, Suspense } from "react";
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

const NODE_META: Record<string, { label: string; color: string; icon: string }> = {
  trigger:       { label: "Trigger",       color: "#8b5cf6", icon: "⚡" },
  sendEmail:     { label: "Send Email",    color: "#f97316", icon: "✉" },
  sendWhatsapp:  { label: "Send WhatsApp", color: "#22c55e", icon: "💬" },
  wait:          { label: "Wait",          color: "#3b82f6", icon: "⏳" },
  condition:     { label: "Condition",     color: "#eab308", icon: "?" },
  updateField:   { label: "Update Field",  color: "#64748b", icon: "✏" },
  webhook:       { label: "Webhook",       color: "#ec4899", icon: "🔗" },
};

function FlowNode({ data, type }: { data: Record<string, unknown>; type: string }) {
  const meta = NODE_META[type] ?? { label: type, color: "#6b7280", icon: "•" };
  const isCondition = type === "condition";

  return (
    <div
      className="min-w-[160px] rounded-xl border-2 shadow-lg overflow-hidden"
      style={{ borderColor: meta.color, background: "#1a1a1a" }}
    >
      <Handle type="target" position={Position.Top} style={{ background: meta.color }} />

      <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: `${meta.color}22` }}>
        <span className="text-sm">{meta.icon}</span>
        <span className="text-xs font-bold text-white">{meta.label}</span>
      </div>

      <div className="px-3 py-2 text-[11px] text-white/60">
        {type === "trigger" && <span>{String(data.event ?? "Event trigger")}</span>}
        {type === "sendEmail" && <span>{String(data.subject ?? "Email subject")}</span>}
        {type === "sendWhatsapp" && <span>{String(data.template_name ?? data.body ?? "WhatsApp message")}</span>}
        {type === "wait" && <span>{String(data.duration_minutes ?? "?")} minutes</span>}
        {type === "condition" && <span>{String(data.field ?? "?")} {String(data.operator ?? "eq")} {String(data.value ?? "?")}</span>}
        {type === "updateField" && <span>Set {String(data.table ?? "?")} · {String(data.column ?? "?")}</span>}
        {type === "webhook" && <span className="truncate block">{String(data.url ?? "Webhook URL")}</span>}
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
      ) : type !== "trigger" ? (
        <Handle type="source" position={Position.Bottom} style={{ background: meta.color }} />
      ) : (
        <Handle type="source" position={Position.Bottom} style={{ background: meta.color }} />
      )}
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

  return (
    <div className="w-72 bg-[#1a1a1a] border-l border-white/10 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-bold text-white">{NODE_META[type]?.label ?? type}</h3>
        <button onClick={onClose} className="text-white/30 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {type === "trigger" && (
          <>
            <label className="text-xs text-white/50 block">Event name</label>
            <input className={inp} value={String(local.event ?? "")} onChange={e => u("event", e.target.value)} placeholder="user.opted_in" />
          </>
        )}

        {type === "sendEmail" && (
          <>
            <label className="text-xs text-white/50 block">To (variable or email)</label>
            <input className={inp} value={String(local.to ?? "")} onChange={e => u("to", e.target.value)} placeholder="{{email}}" />
            <label className="text-xs text-white/50 block">Subject</label>
            <input className={inp} value={String(local.subject ?? "")} onChange={e => u("subject", e.target.value)} placeholder="Welcome to Leadash" />
            <label className="text-xs text-white/50 block">From name (optional)</label>
            <input className={inp} value={String(local.from_name ?? "")} onChange={e => u("from_name", e.target.value)} placeholder="Leadash Team" />
            <label className="text-xs text-white/50 block">HTML body</label>
            <textarea rows={6} className={inp} value={String(local.html ?? "")} onChange={e => u("html", e.target.value)} placeholder="<p>Hello {{full_name}}</p>" />
          </>
        )}

        {type === "sendWhatsapp" && (
          <>
            <label className="text-xs text-white/50 block">Template name (leave blank for free-form)</label>
            <input className={inp} value={String(local.template_name ?? "")} onChange={e => u("template_name", e.target.value)} placeholder="welcome_sequence" />
            <label className="text-xs text-white/50 block">Free-form body (only within 24hr window)</label>
            <textarea rows={4} className={inp} value={String(local.body ?? "")} onChange={e => u("body", e.target.value)} placeholder="Hey {{full_name}}, your access is ready!" />
          </>
        )}

        {type === "wait" && (
          <>
            <label className="text-xs text-white/50 block">Wait duration (minutes)</label>
            <input type="number" className={inp} value={String(local.duration_minutes ?? 60)} onChange={e => u("duration_minutes", parseInt(e.target.value) || 60)} min={1} />
            <p className="text-[10px] text-white/30">The execution pauses here and re-queues when the delay expires.</p>
          </>
        )}

        {type === "condition" && (
          <>
            <label className="text-xs text-white/50 block">Field (e.g. funnel_state.day1_completed_at)</label>
            <input className={inp} value={String(local.field ?? "")} onChange={e => u("field", e.target.value)} placeholder="payload.pct" />
            <label className="text-xs text-white/50 block">Operator</label>
            <select className={inp} value={String(local.operator ?? "eq")} onChange={e => u("operator", e.target.value)}>
              {["eq","neq","gt","lt","gte","lte","contains","not_contains","is_null","is_not_null"].map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
            <label className="text-xs text-white/50 block">Value</label>
            <input className={inp} value={String(local.value ?? "")} onChange={e => u("value", e.target.value)} placeholder="50" />
          </>
        )}

        {type === "updateField" && (
          <>
            <label className="text-xs text-white/50 block">Table</label>
            <select className={inp} value={String(local.table ?? "funnel_states")} onChange={e => u("table", e.target.value)}>
              <option value="funnel_states">funnel_states</option>
              <option value="workspaces">workspaces</option>
            </select>
            <label className="text-xs text-white/50 block">Column</label>
            <input className={inp} value={String(local.column ?? "")} onChange={e => u("column", e.target.value)} placeholder="current_offer" />
            <label className="text-xs text-white/50 block">Value (supports {"{{variables}}"})</label>
            <input className={inp} value={String(local.value ?? "")} onChange={e => u("value", e.target.value)} placeholder="bundle" />
          </>
        )}

        {type === "webhook" && (
          <>
            <label className="text-xs text-white/50 block">URL</label>
            <input className={inp} value={String(local.url ?? "")} onChange={e => u("url", e.target.value)} placeholder="https://your-webhook.com/hook" />
            <label className="text-xs text-white/50 block">Method</label>
            <select className={inp} value={String(local.method ?? "POST")} onChange={e => u("method", e.target.value)}>
              <option>POST</option><option>GET</option><option>PUT</option>
            </select>
          </>
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

// ── Main builder ───────────────────────────────────────────────────────────

let _nodeId = 1;
function nextId() { return `node_${_nodeId++}`; }

function AutomationBuilderInner() {
  const params = useSearchParams();
  const router = useRouter();
  const flowId = params.get("id");

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flowName,     setFlowName]   = useState("New Flow");
  const [isActive,     setIsActive]   = useState(false);
  const [dupPolicy,    setDupPolicy]  = useState<"deduplicate"|"parallel"|"restart">("deduplicate");
  const [forceMigrate, setForceMigrate] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

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
            setNodes(flow.flow_definition.nodes);
            setEdges(flow.flow_definition.edges ?? []);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges],
  );

  function addNode(type: string) {
    const id = nextId();
    const newNode: Node = {
      id,
      type,
      position: { x: 200 + Math.random() * 100, y: 100 + nodes.length * 140 },
      data: {},
    };
    setNodes(nds => [...nds, newNode]);
  }

  function onNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNode(node);
  }

  function updateNodeData(id: string, data: Record<string, unknown>) {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data } : n));
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
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-[#111] flex-shrink-0">
        <button onClick={() => router.push("/admin/automations")} className="text-white/30 hover:text-white/70 text-sm">
          ← Automations
        </button>
        <div className="h-4 w-px bg-white/10" />
        <input
          value={flowName}
          onChange={e => setFlowName(e.target.value)}
          className="bg-transparent text-white text-sm font-semibold focus:outline-none w-48 border-b border-transparent focus:border-orange-500"
        />

        {/* Duplicate policy */}
        <div className="flex items-center gap-1 p-0.5 bg-white/5 rounded-lg ml-2">
          {(["deduplicate","parallel","restart"] as const).map(v => (
            <button
              key={v}
              onClick={() => setDupPolicy(v)}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                dupPolicy === v ? "bg-white/20 text-white" : "text-white/30 hover:text-white/60"
              }`}
            >
              {v === "deduplicate" ? "Skip dupe" : v === "parallel" ? "Parallel" : "Restart"}
            </button>
          ))}
        </div>

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
        {/* Left: node palette */}
        <div className="w-44 bg-[#111] border-r border-white/10 p-3 flex flex-col gap-1.5 flex-shrink-0 overflow-y-auto">
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1">Add node</p>
          {Object.entries(NODE_META).map(([type, meta]) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all"
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
