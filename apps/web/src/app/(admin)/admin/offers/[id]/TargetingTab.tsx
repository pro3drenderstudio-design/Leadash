"use client";
import { useEffect, useState, useCallback } from "react";

/**
 * Targeting tab — activate this offer for specific workspaces (by owner email),
 * optionally with an expiry. A targeted offer (offers.is_targeted) is only
 * visible/purchasable to workspaces listed here. Backed by /api/admin/offer-targets.
 */
interface TargetRow {
  id:           string;
  workspace_id: string;
  source:       string;
  expires_at:   string | null;
  created_at:   string;
  workspaces:   { name: string } | null;
}

export default function TargetingTab({ offerId, isTargeted }: { offerId: string; isTargeted: boolean }) {
  const [rows, setRows]       = useState<TargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail]     = useState("");
  const [expiry, setExpiry]   = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/offer-targets?offer_id=${offerId}`);
      const d = await res.json() as { targets?: TargetRow[] };
      setRows(d.targets ?? []);
    } finally { setLoading(false); }
  }, [offerId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!email.trim()) { setError("Enter the user's email."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/offer-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id: offerId, email: email.trim(), expires_at: expiry ? new Date(expiry).toISOString() : null }),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed to add");
      setEmail(""); setExpiry("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    await fetch(`/api/admin/offer-targets?id=${id}`, { method: "DELETE" });
    setRows(r => r.filter(x => x.id !== id));
  }

  return (
    <div className="space-y-5">
      {!isTargeted && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-300">
          This offer isn&apos;t marked as targeted — it&apos;s public and anyone with the link can buy it. Turn on
          &quot;targeted&quot; in Settings to restrict it to the workspaces below.
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-white/80 mb-1">Activate for a user</p>
        <p className="text-xs text-white/40 mb-3">The offer will show on their billing page (with a countdown if you set an expiry).</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-white/50 mb-1">User email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com"
              className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50" />
          </div>
          <div>
            <label className="block text-[11px] text-white/50 mb-1">Expires (optional)</label>
            <input type="datetime-local" value={expiry} onChange={e => setExpiry(e.target.value)}
              className="px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-orange-500/50" />
          </div>
          <button onClick={add} disabled={busy}
            className="px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-lg transition-colors">
            {busy ? "…" : "Activate"}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>

      <div>
        <p className="text-sm font-semibold text-white/80 mb-2">Active targets</p>
        {loading ? (
          <p className="text-white/30 text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-white/30 text-sm">No one targeted yet.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map(r => {
              const expired = r.expires_at ? new Date(r.expires_at) < new Date() : false;
              return (
                <div key={r.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white/80 truncate">{r.workspaces?.name ?? r.workspace_id}</p>
                    <p className="text-[11px] text-white/35">
                      {r.source}
                      {r.expires_at ? ` · ${expired ? "expired" : "expires"} ${new Date(r.expires_at).toLocaleString()}` : " · no expiry"}
                    </p>
                  </div>
                  <button onClick={() => remove(r.id)} className="text-white/30 hover:text-red-400 text-xs font-semibold flex-shrink-0 ml-3">Remove</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
