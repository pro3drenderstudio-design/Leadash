"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface DedicatedIpSub {
  id: string;
  workspace_id: string;
  status: "pending" | "active" | "cancelling" | "cancelled";
  ip_address: string | null;
  postal_pool_id: string | null;
  max_domains: number;
  max_inboxes: number;
  price_ngn: number;
  notes: string | null;
  cancel_requested_at: string | null;
  retire_at: string | null;
  created_at: string;
  updated_at: string;
  workspace: { name: string; billing_email: string; plan_id: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  active:     "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
  cancelling: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  cancelled:  "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/40",
};

function StatusBadge({ status }: { status: string }) {
  const pulse = status === "pending" || status === "cancelling";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${STATUS_COLORS[status] ?? STATUS_COLORS.pending}`}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {status}
    </span>
  );
}

function ProvisionModal({
  sub,
  onClose,
  onDone,
}: {
  sub: DedicatedIpSub;
  onClose: () => void;
  onDone: (newStatus: string) => void;
}) {
  const [ipAddress,    setIpAddress]    = useState(sub.ip_address    ?? "");
  const [poolId,       setPoolId]       = useState(sub.postal_pool_id ?? "");
  const [serverId,     setServerId]     = useState<number | null>(null);
  const [maxDomains,   setMaxDomains]   = useState(String(sub.max_domains));
  const [maxInboxes,   setMaxInboxes]   = useState(String(sub.max_inboxes));
  const [notes,        setNotes]        = useState(sub.notes ?? "");
  const [saving,       setSaving]       = useState(false);
  const [creating,     setCreating]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function createInPostal() {
    if (!ipAddress) { setError("Enter the IP address first"); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/dedicated-ip/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_postal_pool", ip_address: ipAddress }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create pool"); return; }
      setPoolId(String(data.pool_id));
      setServerId(data.server_id);
    } finally {
      setCreating(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/dedicated-ip/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:           "provision",
          ip_address:       ipAddress,
          postal_pool_id:   poolId || undefined,
          postal_server_id: serverId ?? undefined,
          max_domains:      parseInt(maxDomains),
          max_inboxes:      parseInt(maxInboxes),
          notes:            notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      onDone(data.newStatus);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1a1d26] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/8">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Provision Dedicated IP</h2>
          <p className="text-xs text-slate-500 dark:text-white/40 mt-0.5">
            Workspace: <strong>{sub.workspace?.name ?? sub.workspace_id}</strong>
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1.5">IP Address *</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={ipAddress}
                onChange={e => setIpAddress(e.target.value)}
                placeholder="e.g. 95.217.42.10"
                className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
              <button
                type="button"
                onClick={createInPostal}
                disabled={creating || !ipAddress || !!poolId}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white transition-colors"
                title={poolId ? "Pool already created" : "Create IP pool in Postal automatically"}
              >
                {creating ? "Creating…" : poolId ? "✓ Created" : "Create in Postal"}
              </button>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1.5">
              Postal Pool ID {serverId ? <span className="text-green-500 normal-case">· Server ID: {serverId}</span> : null}
            </span>
            <input
              type="text"
              value={poolId}
              onChange={e => setPoolId(e.target.value)}
              placeholder="Auto-filled when you click Create in Postal"
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1.5">Max Domains</span>
              <input
                type="number"
                value={maxDomains}
                onChange={e => setMaxDomains(e.target.value)}
                min={1}
                max={20}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1.5">Max Inboxes</span>
              <input
                type="number"
                value={maxInboxes}
                onChange={e => setMaxInboxes(e.target.value)}
                min={1}
                max={200}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider block mb-1.5">Notes (internal)</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any provisioning notes…"
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
            />
          </label>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !ipAddress}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white transition-colors"
          >
            {saving ? "Provisioning…" : "Provision & Activate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DedicatedIpInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [subs, setSubs]         = useState<DedicatedIpSub[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<DedicatedIpSub | null>(null);

  const page   = parseInt(searchParams.get("page")   ?? "1");
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";

  const fetchSubs = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), status, search });
    fetch(`/api/admin/dedicated-ip?${q}`)
      .then(r => r.json())
      .then(d => { setSubs(d.subscriptions ?? []); setTotal(d.total ?? 0); setLoading(false); });
  }, [page, status, search]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  function setParam(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    if (key !== "page") p.delete("page");
    router.push(`/admin/dedicated-ip?${p}`);
  }

  async function handleAction(id: string, action: string) {
    if (!confirm(`Run "${action}" on this subscription?`)) return;
    setActioning(id);
    try {
      const res = await fetch(`/api/admin/dedicated-ip/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? "Action failed"); return; }
      setSubs(prev => prev.map(s =>
        s.id === id ? { ...s, status: data.newStatus ?? s.status } : s,
      ));
      if (action === "blacklist_check") {
        alert(data.result?.isClean
          ? "IP is clean — not listed on any monitored blocklist."
          : `IP is listed on: ${(data.result?.blacklistsHit ?? []).join(", ")}`,
        );
      }
    } finally {
      setActioning(null);
    }
  }

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dedicated IPs</h1>
        <p className="text-sm text-slate-500 dark:text-white/40 mt-0.5">{total.toLocaleString()} total subscriptions · ₦78,400/mo (~$49)</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search by IP or workspace…"
            defaultValue={search}
            onKeyDown={e => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
        <select
          value={status}
          onChange={e => setParam("status", e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-700 dark:text-white/70 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="cancelling">Cancelling</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/10">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Workspace</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden md:table-cell">IP Address</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden lg:table-cell">Limits</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider hidden xl:table-cell">Retire</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 dark:text-white/30 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-200 dark:bg-white/10 rounded animate-pulse" /></td>
                ))}
              </tr>
            ))}
            {!loading && subs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-slate-400 dark:text-white/30">
                  No dedicated IP subscriptions yet.
                </td>
              </tr>
            )}
            {!loading && subs.map(sub => (
              <tr key={sub.id} className={`hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors ${actioning === sub.id ? "opacity-50 pointer-events-none" : ""}`}>
                <td className="px-5 py-4">
                  <p className="font-medium text-slate-800 dark:text-white/90">{sub.workspace?.name ?? "—"}</p>
                  <p className="text-xs text-slate-400 dark:text-white/30 truncate max-w-[160px]">{sub.workspace?.billing_email}</p>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={sub.status} />
                  {sub.notes && (
                    <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5 max-w-[140px] truncate" title={sub.notes}>{sub.notes}</p>
                  )}
                </td>
                <td className="px-4 py-4 hidden md:table-cell">
                  {sub.ip_address
                    ? <span className="font-mono text-sm text-slate-700 dark:text-white/70">{sub.ip_address}</span>
                    : <span className="text-slate-300 dark:text-white/20 text-xs italic">not provisioned</span>
                  }
                  {sub.postal_pool_id && (
                    <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">Pool: {sub.postal_pool_id}</p>
                  )}
                </td>
                <td className="px-4 py-4 hidden lg:table-cell">
                  <p className="text-xs text-slate-600 dark:text-white/60">{sub.max_domains} domains · {sub.max_inboxes} inboxes</p>
                  <p className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5">₦{sub.price_ngn.toLocaleString()}/mo</p>
                </td>
                <td className="px-4 py-4 hidden xl:table-cell text-xs text-slate-500 dark:text-white/40">
                  {sub.retire_at
                    ? new Date(sub.retire_at).toLocaleDateString()
                    : "—"
                  }
                </td>
                <td className="px-4 py-4">
                  <div className="flex gap-1.5 flex-wrap">
                    {sub.status === "pending" && (
                      <button
                        onClick={() => setProvisioning(sub)}
                        className="text-[11px] font-medium px-2 py-1 rounded bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
                      >
                        Provision
                      </button>
                    )}
                    {sub.status === "active" && (
                      <>
                        <button
                          onClick={() => setProvisioning(sub)}
                          className="text-[11px] font-medium px-2 py-1 rounded bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-white/50 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleAction(sub.id, "blacklist_check")}
                          className="text-[11px] font-medium px-2 py-1 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                        >
                          Check BL
                        </button>
                        <button
                          onClick={() => handleAction(sub.id, "cancel")}
                          className="text-[11px] font-medium px-2 py-1 rounded bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {sub.status === "cancelling" && (
                      <button
                        onClick={() => handleAction(sub.id, "finalise_cancel")}
                        className="text-[11px] font-medium px-2 py-1 rounded bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-white/50 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                      >
                        Finalise Cancel
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
            <p className="text-xs text-slate-400 dark:text-white/30">
              Showing {((page - 1) * 30) + 1}–{Math.min(page * 30, total)} of {total.toLocaleString()}
            </p>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setParam("page", String(i + 1))}
                  className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                    i + 1 === page
                      ? "bg-orange-500 text-white"
                      : "text-slate-500 dark:text-white/40 hover:bg-slate-100 dark:hover:bg-white/10"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {provisioning && (
        <ProvisionModal
          sub={provisioning}
          onClose={() => setProvisioning(null)}
          onDone={newStatus => {
            setSubs(prev => prev.map(s => s.id === provisioning.id ? { ...s, status: newStatus as DedicatedIpSub["status"] } : s));
            setProvisioning(null);
          }}
        />
      )}
    </div>
  );
}

export default function DedicatedIpPage() {
  return <Suspense><DedicatedIpInner /></Suspense>;
}
