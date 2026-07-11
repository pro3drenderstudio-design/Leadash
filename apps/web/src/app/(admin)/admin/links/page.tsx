"use client";
import { useEffect, useState, useCallback } from "react";

interface TrackedLink {
  id: string;
  slug: string;
  title: string;
  destination_url: string;
  description: string | null;
  total_clicks: number;
  unique_clicks: number;
  is_active: boolean;
  created_at: string;
}

interface Analytics {
  total: number;
  unique: number;
  daily: { date: string; count: number }[];
  devices: Record<string, number>;
  top_referrers: { source: string; count: number }[];
  window_from: string;
  window_to: string;
}

type Preset = "today" | "7d" | "30d" | "90d" | "custom";

function presetRange(preset: Preset): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  switch (preset) {
    case "today":  return { from: today, to: today };
    case "7d":     return { from: daysAgo(6),  to: today };
    case "30d":    return { from: daysAgo(29), to: today };
    case "90d":    return { from: daysAgo(89), to: today };
    default:       return { from: daysAgo(29), to: today };
  }
}

const PRESET_LABELS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d",    label: "7 Days" },
  { key: "30d",   label: "30 Days" },
  { key: "90d",   label: "90 Days" },
  { key: "custom",label: "Custom" },
];

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "";

export default function AdminLinksPage() {
  const [links, setLinks]         = useState<TrackedLink[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<TrackedLink | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [aLoading, setALoading]   = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]           = useState({ slug: "", title: "", destination_url: "", description: "" });
  const [saving, setSaving]       = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [editDest, setEditDest]   = useState("");
  const [editingDest, setEditingDest] = useState(false);

  // Date range
  const [preset, setPreset]         = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState(new Date().toISOString().slice(0, 10));

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/links${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    const data = await res.json() as { links: TrackedLink[] };
    setLinks(data.links ?? []);
    setLoading(false);
  }, [search]);

  useEffect(() => { void fetchLinks(); }, [fetchLinks]);

  const fetchAnalytics = useCallback(async (linkId: string, p: Preset, cFrom: string, cTo: string) => {
    setALoading(true);
    setAnalytics(null);
    const { from, to } = p === "custom" ? { from: cFrom, to: cTo } : presetRange(p);
    if (!from) { setALoading(false); return; }
    const res = await fetch(`/api/admin/links/${linkId}?from=${from}&to=${to}`);
    const data = await res.json() as { analytics: Analytics };
    setAnalytics(data.analytics ?? null);
    setALoading(false);
  }, []);

  async function openLink(link: TrackedLink) {
    setSelected(link);
    setEditDest(link.destination_url);
    void fetchAnalytics(link.id, preset, customFrom, customTo);
  }

  // Re-fetch when date range changes (if a link is selected)
  useEffect(() => {
    if (!selected) return;
    if (preset === "custom" && !customFrom) return;
    void fetchAnalytics(selected.id, preset, customFrom, customTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo]);

  async function createLink() {
    setSaving(true); setCreateErr("");
    const res = await fetch("/api/admin/links", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json() as { link?: TrackedLink; error?: string };
    if (!res.ok) { setCreateErr(data.error ?? "Failed"); setSaving(false); return; }
    setShowCreate(false);
    setForm({ slug: "", title: "", destination_url: "", description: "" });
    setSaving(false);
    await fetchLinks();
  }

  async function toggleActive(link: TrackedLink) {
    await fetch(`/api/admin/links/${link.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !link.is_active }),
    });
    await fetchLinks();
    if (selected?.id === link.id) setSelected(s => s ? { ...s, is_active: !s.is_active } : null);
  }

  async function updateDestination() {
    if (!selected) return;
    setEditingDest(false);
    await fetch(`/api/admin/links/${selected.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination_url: editDest }),
    });
    setSelected(s => s ? { ...s, destination_url: editDest } : null);
    await fetchLinks();
  }

  async function deleteLink(id: string) {
    if (!confirm("Delete this link? All click data will be lost.")) return;
    await fetch(`/api/admin/links/${id}`, { method: "DELETE" });
    if (selected?.id === id) { setSelected(null); setAnalytics(null); }
    await fetchLinks();
  }

  const fullUrl = (slug: string) => `${BASE}/go/${slug}`;
  const copy = (text: string) => void navigator.clipboard.writeText(text);

  const btnBase: React.CSSProperties = { border: "none", borderRadius: 5, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 500 };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0f0f0f", color: "#e5e5e5", fontFamily: "system-ui, sans-serif" }}>

      {/* Left panel */}
      <div style={{ width: 380, borderRight: "1px solid #1f1f1f", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #1f1f1f" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Link Tracker</h1>
            <button onClick={() => setShowCreate(true)}
              style={{ background: "#f97316", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
              + New Link
            </button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search links..."
            style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 13, boxSizing: "border-box" }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 20, color: "#666", fontSize: 13 }}>Loading...</div>
          ) : links.length === 0 ? (
            <div style={{ padding: 20, color: "#666", fontSize: 13 }}>No links yet. Create your first one.</div>
          ) : links.map(link => (
            <div key={link.id} onClick={() => openLink(link)}
              style={{ padding: "14px 20px", borderBottom: "1px solid #1a1a1a", cursor: "pointer", background: selected?.id === link.id ? "#1a1a1a" : "transparent" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: link.is_active ? "#22c55e" : "#ef4444", flexShrink: 0 }} />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{link.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "#f97316", marginBottom: 4 }}>/go/{link.slug}</div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#888" }}>
                <span>↗ {link.total_clicks.toLocaleString()} clicks</span>
                <span>✦ {link.unique_clicks.toLocaleString()} unique</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#555", fontSize: 14 }}>
            Select a link to see analytics
          </div>
        ) : (
          <div style={{ padding: 32, maxWidth: 860 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 600 }}>{selected.title}</h2>
                {selected.description && <p style={{ margin: "0 0 8px", color: "#888", fontSize: 13 }}>{selected.description}</p>}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "#f97316", fontFamily: "monospace" }}>{fullUrl(selected.slug)}</span>
                  <button onClick={() => copy(fullUrl(selected.slug))}
                    style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, padding: "2px 8px", fontSize: 11, color: "#aaa", cursor: "pointer" }}>
                    Copy
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => toggleActive(selected)}
                  style={{ background: selected.is_active ? "#1a1a1a" : "#14532d", border: `1px solid ${selected.is_active ? "#ef4444" : "#22c55e"}`, borderRadius: 6, padding: "6px 14px", fontSize: 12, color: selected.is_active ? "#ef4444" : "#22c55e", cursor: "pointer" }}>
                  {selected.is_active ? "Disable" : "Enable"}
                </button>
                <button onClick={() => deleteLink(selected.id)}
                  style={{ background: "#1a1a1a", border: "1px solid #3f1a1a", borderRadius: 6, padding: "6px 14px", fontSize: 12, color: "#ef4444", cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            </div>

            {/* Destination URL */}
            <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Destination URL</div>
              {editingDest ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={editDest} onChange={e => setEditDest(e.target.value)}
                    style={{ flex: 1, background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 13 }} autoFocus />
                  <button onClick={updateDestination} style={{ background: "#f97316", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>Save</button>
                  <button onClick={() => { setEditingDest(false); setEditDest(selected.destination_url); }}
                    style={{ background: "#1f1f1f", color: "#aaa", border: "1px solid #333", borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, color: "#ccc", wordBreak: "break-all" }}>{selected.destination_url}</span>
                  <button onClick={() => setEditingDest(true)}
                    style={{ background: "#1f1f1f", color: "#aaa", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>Edit</button>
                </div>
              )}
            </div>

            {/* Date range picker */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {PRESET_LABELS.map(({ key, label }) => (
                <button key={key} onClick={() => { setPreset(key); if (key !== "custom") setCustomFrom(""); }}
                  style={{ ...btnBase, background: preset === key ? "#f97316" : "#1a1a1a", color: preset === key ? "#fff" : "#aaa", border: `1px solid ${preset === key ? "#f97316" : "#2a2a2a"}` }}>
                  {label}
                </button>
              ))}
              {preset === "custom" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={customTo}
                    style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 5, padding: "4px 8px", color: "#ccc", fontSize: 12, colorScheme: "dark" }} />
                  <span style={{ color: "#555", fontSize: 12 }}>→</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom} max={new Date().toISOString().slice(0, 10)}
                    style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 5, padding: "4px 8px", color: "#ccc", fontSize: 12, colorScheme: "dark" }} />
                </div>
              )}
            </div>

            {/* Analytics */}
            {aLoading ? (
              <div style={{ color: "#666", fontSize: 13 }}>Loading analytics...</div>
            ) : analytics && (
              <>
                {/* Summary tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Clicks in range", value: analytics.total },
                    { label: "Unique in range",  value: analytics.unique },
                    { label: "All time (unique)", value: selected.unique_clicks },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "14px 16px" }}>
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                      <div style={{ fontSize: 28, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* Sparkline */}
                {analytics.daily.length > 0 && (
                  <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 16, marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Daily clicks
                      </div>
                      <div style={{ fontSize: 11, color: "#555" }}>
                        {analytics.window_from.slice(0, 10)} → {analytics.window_to.slice(0, 10)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
                      {(() => {
                        const max = Math.max(...analytics.daily.map(d => d.count), 1);
                        return analytics.daily.map(d => (
                          <div key={d.date} title={`${d.date}: ${d.count}`}
                            style={{ flex: 1, minWidth: 2, height: `${Math.max(4, (d.count / max) * 60)}px`, background: "#f97316", borderRadius: 2, opacity: 0.85 }} />
                        ));
                      })()}
                    </div>
                    {/* X-axis date labels — show first and last */}
                    {analytics.daily.length > 1 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "#555" }}>
                        <span>{analytics.daily[0].date}</span>
                        <span>{analytics.daily[analytics.daily.length - 1].date}</span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* Devices */}
                  <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>By Device</div>
                    {Object.entries(analytics.devices).sort(([,a],[,b]) => b - a).map(([device, count]) => (
                      <div key={device} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid #1f1f1f" }}>
                        <span style={{ textTransform: "capitalize", color: "#ccc" }}>{device}</span>
                        <span style={{ color: "#888", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                      </div>
                    ))}
                    {Object.keys(analytics.devices).length === 0 && <span style={{ color: "#555", fontSize: 13 }}>No data</span>}
                  </div>

                  {/* Top sources */}
                  <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Top Sources</div>
                    {analytics.top_referrers.slice(0, 8).map(({ source, count }) => (
                      <div key={source} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid #1f1f1f" }}>
                        <span style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{source}</span>
                        <span style={{ color: "#888", fontVariantNumeric: "tabular-nums" }}>{count}</span>
                      </div>
                    ))}
                    {analytics.top_referrers.length === 0 && <span style={{ color: "#555", fontSize: 13 }}>No data</span>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, width: 480, maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 600 }}>Create Tracked Link</h3>
            {createErr && <div style={{ background: "#2d1414", border: "1px solid #5c2626", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#f87171" }}>{createErr}</div>}
            {(["slug", "title", "destination_url", "description"] as const).map(field => (
              <div key={field} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4, textTransform: "capitalize" }}>
                  {field === "destination_url" ? "Destination URL" : field === "slug" ? "Slug (e.g. whatsapp-challenge-group)" : field}
                  {field !== "description" && " *"}
                </label>
                <input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={field === "slug" ? "whatsapp-challenge-group" : field === "title" ? "WhatsApp Challenge Group" : field === "destination_url" ? "https://chat.whatsapp.com/..." : ""}
                  style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 6, padding: "9px 12px", color: "#e5e5e5", fontSize: 13, boxSizing: "border-box" }} />
                {field === "slug" && form.slug && (
                  <div style={{ fontSize: 11, color: "#f97316", marginTop: 4 }}>leadash.com/go/{form.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-")}</div>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => { setShowCreate(false); setCreateErr(""); }}
                style={{ background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 16px", color: "#aaa", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={createLink} disabled={saving}
                style={{ background: "#f97316", color: "#fff", border: "none", borderRadius: 6, padding: "8px 20px", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Creating..." : "Create Link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
