"use client";
import { useEffect, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PostalNode {
  id:               string;
  label:            string;
  ip_address:       string;
  postal_server_id: number | null;
  postal_pool_id:   number | null;
  status:           "active" | "provisioning" | "offline" | "retired";
  is_shared:        boolean;
  workspace_id:     string | null;
  inbox_limit:      number;
  notes:            string | null;
  provisioned_at:   string | null;
  created_at:       string;
  inbox_count:      number;
  domain_count:     number;
  pct:              number;
  workspace:        { id: string; name: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pctColor(pct: number) {
  if (pct >= 100) return "text-red-600 dark:text-red-400";
  if (pct >= 80)  return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}
function pctBarColor(pct: number) {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80)  return "bg-amber-500";
  return "bg-green-500";
}

function StatusBadge({ status }: { status: PostalNode["status"] }) {
  const cls = {
    active:       "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
    provisioning: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    offline:      "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/40",
    retired:      "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300",
  }[status];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function CapacityBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pctBarColor(pct)}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums w-10 text-right ${pctColor(pct)}`}>
        {pct}%
      </span>
    </div>
  );
}

// ── Add Node Form ──────────────────────────────────────────────────────────────

function AddNodeModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    label:      "",
    ip_address: "",
    is_shared:  true,
    inbox_limit: 150,
    postal_server_id: "",
    postal_pool_id:   "",
    notes: "",
  });
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/admin/postal-nodes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          label:            form.label.trim(),
          ip_address:       form.ip_address.trim(),
          is_shared:        form.is_shared,
          inbox_limit:      form.inbox_limit,
          postal_server_id: form.postal_server_id ? parseInt(form.postal_server_id) : null,
          postal_pool_id:   form.postal_pool_id   ? parseInt(form.postal_pool_id)   : null,
          notes:            form.notes || null,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#111] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-800 dark:text-white/90">Add Postal Node</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 text-xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1">Label</label>
            <input
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Node 2 — Shared Pool"
              required
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white/90 placeholder-slate-300 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1">IP Address</label>
            <input
              value={form.ip_address}
              onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))}
              placeholder="198.51.100.1"
              required
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white/90 placeholder-slate-300 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/40 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1">Type</label>
              <select
                value={form.is_shared ? "shared" : "dedicated"}
                onChange={e => {
                  const shared = e.target.value === "shared";
                  setForm(f => ({ ...f, is_shared: shared, inbox_limit: shared ? 150 : 100 }));
                }}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              >
                <option value="shared">Shared pool</option>
                <option value="dedicated">Dedicated (workspace)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1">Inbox limit</label>
              <input
                type="number"
                value={form.inbox_limit}
                onChange={e => setForm(f => ({ ...f, inbox_limit: parseInt(e.target.value) || 150 }))}
                min={1}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-red-500/40 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1">Postal Server ID <span className="text-slate-300 dark:text-white/20">(optional)</span></label>
              <input
                type="number"
                value={form.postal_server_id}
                onChange={e => setForm(f => ({ ...f, postal_server_id: e.target.value }))}
                placeholder="e.g. 2"
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white/90 placeholder-slate-300 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/40 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1">Postal Pool ID <span className="text-slate-300 dark:text-white/20">(optional)</span></label>
              <input
                type="number"
                value={form.postal_pool_id}
                onChange={e => setForm(f => ({ ...f, postal_pool_id: e.target.value }))}
                placeholder="e.g. 3"
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white/90 placeholder-slate-300 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/40 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-white/40 mb-1">Notes <span className="text-slate-300 dark:text-white/20">(optional)</span></label>
            <input
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Contabo VPS — Frankfurt"
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white/90 placeholder-slate-300 dark:placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-red-500/40"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50">
              {saving ? "Adding…" : "Add Node"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Contabo Purchase Guide ─────────────────────────────────────────────────────

function PurchaseGuide() {
  const [open, setOpen] = useState(false);

  const steps = [
    {
      n: 1,
      title: "Order a VPS from Contabo",
      body: (
        <p>
          Go to <span className="font-mono text-xs bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded">contabo.com</span> → VPS → <strong>VPS S</strong> (4 vCPU, 6 GB RAM, $6.99/mo).
          Select <strong>Ubuntu 22.04</strong>, choose a region close to your users (e.g. US Central for Nigeria latency), and complete checkout.
          You will receive an email with your VPS IP and root credentials within 5–15 minutes.
        </p>
      ),
    },
    {
      n: 2,
      title: "Install Postal on the new VPS",
      body: (
        <div className="space-y-2">
          <p>SSH into the VPS as root and run the Postal one-line installer:</p>
          <pre className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`bash <(curl -sL https://raw.githubusercontent.com/postalserver/install/main/install.sh)`}
          </pre>
          <p>During setup, set the same <strong>API credentials</strong> as your existing Postal node so the postal-agent can manage both servers with one secret.</p>
        </div>
      ),
    },
    {
      n: 3,
      title: "Add the node to the Postal cluster",
      body: (
        <p>
          In the Postal web UI on the new server, create a new <strong>Mail Server</strong> and note its <strong>Server ID</strong> (visible in the URL).
          If this is a dedicated IP node, also create an <strong>IP Pool</strong> and note the <strong>Pool ID</strong>.
          Both IDs go into the form when you add the node below.
        </p>
      ),
    },
    {
      n: 4,
      title: "Register the node in Leadash",
      body: (
        <p>
          Click <strong>Add Node</strong> above and fill in the IP address, Postal Server ID, and Pool ID.
          Set the status to <strong>Active</strong> once Postal is running and mail is flowing.
          New inboxes will automatically be provisioned on the node with the lowest load.
        </p>
      ),
    },
    {
      n: 5,
      title: "Verify DNS (MX / SPF)",
      body: (
        <p>
          Each domain provisioned on the new node needs its <strong>MX record</strong> updated to point to the new VPS IP,
          and the <strong>SPF record</strong> updated to include the new IP ({`v=spf1 ip4:NEW_IP ...`}).
          This is handled automatically for new domains provisioned after the node is added.
          Existing domains on the old node are unaffected — they continue sending via their original IP.
        </p>
      ),
    },
  ];

  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm">
            📖
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-white/90">How to add a new IP node</p>
            <p className="text-xs text-slate-400 dark:text-white/30">Step-by-step guide — Contabo VPS → Postal → Leadash</p>
          </div>
        </div>
        <span className={`text-slate-400 dark:text-white/30 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-white/10 p-5 space-y-5">
          {steps.map(step => (
            <div key={step.n} className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {step.n}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white/90 mb-1">{step.title}</p>
                <div className="text-sm text-slate-500 dark:text-white/50 leading-relaxed">{step.body}</div>
              </div>
            </div>
          ))}

          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
            <strong>Cost estimate:</strong> Contabo VPS S is ~$6.99/mo per node. At 150 inboxes/node, that is $0.047/inbox/month in infrastructure cost. A node supports the platform until full — no per-send infra cost.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Node Card ──────────────────────────────────────────────────────────────────

function NodeCard({ node, onStatusChange }: { node: PostalNode; onStatusChange: () => void }) {
  const [editing,  setEditing]  = useState(false);
  const [newLabel, setNewLabel] = useState(node.label);
  const [newNotes, setNewNotes] = useState(node.notes ?? "");
  const [saving,   setSaving]   = useState(false);

  async function saveLabel() {
    setSaving(true);
    await fetch(`/api/admin/postal-nodes/${node.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ label: newLabel, notes: newNotes || null }),
    });
    setSaving(false);
    setEditing(false);
    onStatusChange();
  }

  async function setStatus(status: PostalNode["status"]) {
    await fetch(`/api/admin/postal-nodes/${node.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
    onStatusChange();
  }

  async function markProvisioned() {
    await fetch(`/api/admin/postal-nodes/${node.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: "active", provisioned_at: new Date().toISOString() }),
    });
    onStatusChange();
  }

  return (
    <div className={`bg-white dark:bg-white/5 border rounded-xl p-5 space-y-4 ${
      node.pct >= 100 ? "border-red-300 dark:border-red-500/40"
      : node.pct >= 80 ? "border-amber-300 dark:border-amber-500/40"
      : "border-slate-200 dark:border-white/10"
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-800 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              />
              <input
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 dark:text-white/60 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              />
              <div className="flex gap-2">
                <button onClick={saveLabel} disabled={saving} className="text-xs px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50">
                  {saving ? "…" : "Save"}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs px-2.5 py-1 border border-slate-200 dark:border-white/10 rounded-lg text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-800 dark:text-white/90">{node.label}</span>
                <StatusBadge status={node.status} />
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${node.is_shared ? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40" : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300"}`}>
                  {node.is_shared ? "Shared" : "Dedicated"}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 dark:text-white/30 mt-0.5">{node.ip_address}</p>
              {node.notes && <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{node.notes}</p>}
              {node.workspace && (
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                  Dedicated to: {node.workspace.name}
                </p>
              )}
            </>
          )}
        </div>

        {!editing && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 transition-colors"
            >
              Edit
            </button>
            {node.status === "provisioning" && (
              <button
                onClick={markProvisioned}
                className="text-xs text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 rounded-lg px-2 py-1 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors"
              >
                Mark Active
              </button>
            )}
            {node.status === "active" && (
              <button
                onClick={() => setStatus("offline")}
                className="text-xs text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 transition-colors"
              >
                Set Offline
              </button>
            )}
            {node.status === "offline" && (
              <button
                onClick={() => setStatus("active")}
                className="text-xs text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/30 rounded-lg px-2 py-1 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors"
              >
                Bring Online
              </button>
            )}
          </div>
        )}
      </div>

      {/* Capacity bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400 dark:text-white/30">Inbox capacity</span>
          <span className={`text-xs font-bold tabular-nums ${pctColor(node.pct)}`}>
            {node.inbox_count} / {node.inbox_limit}
          </span>
        </div>
        <CapacityBar pct={node.pct} />
        {node.pct >= 80 && (
          <p className={`text-xs mt-1.5 ${node.pct >= 100 ? "text-red-500" : "text-amber-500"}`}>
            {node.pct >= 100
              ? "⚠ At capacity — new inboxes cannot be provisioned here"
              : `${node.inbox_limit - node.inbox_count} slots remaining — order a new node soon`}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 pt-1 border-t border-slate-100 dark:border-white/5">
        <div>
          <p className="text-[11px] text-slate-400 dark:text-white/30">Domains</p>
          <p className="text-sm font-bold text-slate-700 dark:text-white/80 tabular-nums">{node.domain_count}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 dark:text-white/30">Postal Server ID</p>
          <p className="text-sm font-mono font-bold text-slate-700 dark:text-white/80">
            {node.postal_server_id ?? <span className="text-slate-300 dark:text-white/20 font-normal">—</span>}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400 dark:text-white/30">Pool ID</p>
          <p className="text-sm font-mono font-bold text-slate-700 dark:text-white/80">
            {node.postal_pool_id ?? <span className="text-slate-300 dark:text-white/20 font-normal">—</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PostalNodesPage() {
  const [nodes,    setNodes]    = useState<PostalNode[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/postal-nodes");
    if (res.ok) {
      const data = await res.json() as { nodes: PostalNode[] };
      setNodes(data.nodes);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeNodes  = nodes.filter(n => n.status !== "retired");
  const totalInboxes = activeNodes.reduce((s, n) => s + n.inbox_count, 0);
  const totalCap     = activeNodes.reduce((s, n) => s + n.inbox_limit, 0);
  const overallPct   = totalCap > 0 ? Math.round((totalInboxes / totalCap) * 100) : 0;
  const atRisk       = activeNodes.filter(n => n.pct >= 80);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white/90">SMTP Nodes</h1>
          <p className="text-sm text-slate-400 dark:text-white/30 mt-0.5">
            Postal VPS nodes in the sending pool · 150 inboxes/node (shared) · 100 inboxes/node (dedicated)
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          + Add Node
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <p className="text-xs text-slate-400 dark:text-white/30 mb-1">Active nodes</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white/90">{activeNodes.filter(n => n.status === "active").length}</p>
        </div>
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <p className="text-xs text-slate-400 dark:text-white/30 mb-1">Total inboxes</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white/90">{totalInboxes.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
          <p className="text-xs text-slate-400 dark:text-white/30 mb-1">Total capacity</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white/90">{totalCap.toLocaleString()}</p>
        </div>
        <div className={`border rounded-xl p-4 ${overallPct >= 80 ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30" : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10"}`}>
          <p className="text-xs text-slate-400 dark:text-white/30 mb-1">Overall utilisation</p>
          <p className={`text-2xl font-bold tabular-nums ${pctColor(overallPct)}`}>{overallPct}%</p>
        </div>
      </div>

      {/* Capacity warnings */}
      {atRisk.length > 0 && (
        <div className="space-y-2">
          {atRisk.map(n => (
            <div key={n.id} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
              n.pct >= 100
                ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30"
                : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
            }`}>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${n.pct >= 100 ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"}`}>
                {n.pct >= 100 ? "CRITICAL" : "WARNING"}
              </span>
              <span className="font-medium text-slate-800 dark:text-white/90">
                {n.label} — {n.inbox_count}/{n.inbox_limit} inboxes ({n.pct}%)
              </span>
              <span className="text-slate-400 dark:text-white/30 text-xs ml-auto font-mono">{n.ip_address}</span>
            </div>
          ))}
        </div>
      )}

      {/* Node grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-600 dark:text-white/50 mb-3">
          All Nodes ({activeNodes.length})
        </h2>
        {activeNodes.length === 0 ? (
          <div className="text-center py-12 text-slate-400 dark:text-white/30 text-sm">
            No nodes registered. Add your first node above.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {activeNodes.map(node => (
              <NodeCard key={node.id} node={node} onStatusChange={load} />
            ))}
          </div>
        )}
      </div>

      {/* Retired nodes (collapsed) */}
      {nodes.some(n => n.status === "retired") && (
        <details className="group">
          <summary className="text-xs text-slate-400 dark:text-white/30 cursor-pointer hover:text-slate-600 dark:hover:text-white/50 select-none">
            {nodes.filter(n => n.status === "retired").length} retired node(s)
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {nodes.filter(n => n.status === "retired").map(node => (
              <NodeCard key={node.id} node={node} onStatusChange={load} />
            ))}
          </div>
        </details>
      )}

      {/* Purchase guide */}
      <PurchaseGuide />

      {showAdd && (
        <AddNodeModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}
