"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Cohort automation controls for the Academy → Cohorts tab:
 *  - "Launch next challenge cohort" (manual run of run_cohort_scheduler)
 *  - Cohort 1–52 WhatsApp group links (auto-swapped into the active-group
 *    redirect when the scheduler opens a cohort).
 * Backed by /api/admin/academy/cohort-config.
 */
export default function CohortAutomation() {
  const [launching, setLaunching]     = useState(false);
  const [groups, setGroups]           = useState<Record<string, string>>({});
  const [activeSlug, setActiveSlug]   = useState("7-days-challenge");
  const [currentNum, setCurrentNum]   = useState<number | null>(null);
  const [activeDest, setActiveDest]   = useState<string | null>(null);
  const [showGroups, setShowGroups]   = useState(false);
  const [savingGroups, setSavingGroups] = useState(false);
  const [msg, setMsg]                 = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    const res = await fetch("/api/admin/academy/cohort-config");
    if (!res.ok) return;
    const d = await res.json();
    setGroups(d.groups ?? {});
    setActiveSlug(d.active_link_slug ?? "7-days-challenge");
    setCurrentNum(d.current_cohort_number ?? null);
    setActiveDest(d.active_link?.destination_url ?? null);
  }, []);
  useEffect(() => { void loadConfig(); }, [loadConfig]);

  async function launchNext() {
    if (!window.confirm("Run the cohort scheduler now? Opens the next cohort if it's due and swaps the active WhatsApp group link to it.")) return;
    setLaunching(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/academy/cohort-config", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error ?? "Failed to run scheduler"); return; }
      setMsg(d.created > 0
        ? `✅ Opened Cohort ${d.current_cohort_number} — active group link updated.`
        : `Already up to date — current enrolling cohort is Cohort ${d.current_cohort_number ?? "?"}.`);
      await loadConfig();
    } finally { setLaunching(false); }
  }

  async function saveGroups() {
    setSavingGroups(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/academy/cohort-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_link_slug: activeSlug, groups }),
      });
      if (!res.ok) { const d = await res.json(); setMsg(d.error ?? "Save failed"); return; }
      setMsg("WhatsApp group links saved.");
      await loadConfig();
    } finally { setSavingGroups(false); }
  }

  return (
    <div className="ac-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Challenge cohort automation</h3>
          <p style={{ fontSize: 12.5, color: "var(--app-text-muted)" }}>
            Currently enrolling: <strong style={{ color: "var(--app-text)" }}>Cohort {currentNum ?? "—"}</strong>. Opens weekly automatically — use the button if it didn&apos;t fire.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/admin/academy/cohorts" className="app-btn app-btn-ghost" style={{ fontSize: 12.5 }}>Leaderboards &amp; winners →</Link>
          <button onClick={launchNext} disabled={launching} className="app-btn app-btn-primary" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
            {launching ? "Launching…" : "🚀 Launch next challenge cohort"}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 8, padding: "9px 12px", marginTop: 12, fontSize: 12.5, color: "#6EE7B7" }}>{msg}</div>
      )}

      <button onClick={() => setShowGroups(s => !s)}
        style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: "#60A5FA", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        {showGroups ? "▾ Hide" : "▸ Set"} WhatsApp group links (Cohort 1–52)
      </button>

      {showGroups && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--app-border)", paddingTop: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <label className="ac-label">Active-group tracked-link slug (leadash.com/go/&lt;slug&gt;)</label>
            <input value={activeSlug} onChange={e => setActiveSlug(e.target.value)} className="ac-input" style={{ maxWidth: 260 }} />
            <p style={{ fontSize: 11.5, color: "var(--app-text-quiet)", marginTop: 6, lineHeight: 1.5 }}>
              When the scheduler opens <strong>Cohort N</strong>, this link&apos;s destination becomes the Cohort N group below — signups always join the right group.
              {activeDest && <> Current: <span style={{ color: "var(--app-text-muted)", wordBreak: "break-all" }}>{activeDest}</span></>}
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
            {Array.from({ length: 52 }, (_, i) => i + 1).map(n => {
              const isCurrent = n === currentNum;
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 66, flexShrink: 0, fontSize: 11.5, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? "var(--app-accent)" : "var(--app-text-quiet)" }}>
                    Cohort {n}{isCurrent ? " ●" : ""}
                  </span>
                  <input
                    value={groups[String(n)] ?? ""}
                    onChange={e => setGroups(g => ({ ...g, [String(n)]: e.target.value }))}
                    placeholder="https://chat.whatsapp.com/…"
                    className="ac-input"
                    style={{ flex: 1, minWidth: 0, fontSize: 12, borderColor: isCurrent ? "var(--app-accent)" : undefined }}
                  />
                </div>
              );
            })}
          </div>
          <button onClick={saveGroups} disabled={savingGroups} className="app-btn app-btn-ghost" style={{ marginTop: 12, fontSize: 12.5 }}>
            {savingGroups ? "Saving…" : "Save group links"}
          </button>
        </div>
      )}
    </div>
  );
}
