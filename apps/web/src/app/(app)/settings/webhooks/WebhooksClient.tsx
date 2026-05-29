"use client";
import React, { useEffect, useState } from "react";
import { wsFetch } from "@/lib/workspace/client";

const WEBHOOK_EVENTS = [
  { value: "reply.received",       label: "Reply Received" },
  { value: "send.opened",          label: "Send Opened" },
  { value: "send.clicked",         label: "Send Clicked" },
  { value: "send.bounced",         label: "Send Bounced" },
  { value: "lead.unsubscribed",    label: "Lead Unsubscribed" },
  { value: "enrollment.completed", label: "Enrollment Completed" },
];

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  secret: string;
  enabled: boolean;
  created_at: string;
}

export default function WebhooksClient() {
  const [endpoints, setEndpoints]     = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [newUrl, setNewUrl]           = useState("");
  const [newEvents, setNewEvents]     = useState<string[]>([]);
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [copiedId, setCopiedId]       = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await wsFetch("/api/outreach/webhooks");
    if (r.ok) setEndpoints(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!newUrl || !newEvents.length) {
      setCreateError("URL and at least one event are required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    const r = await wsFetch("/api/outreach/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: newUrl, events: newEvents }),
    });
    const data = await r.json();
    if (!r.ok) { setCreateError(data.error ?? "Failed to create"); setCreating(false); return; }
    setEndpoints(prev => [...prev, data]);
    setNewUrl("");
    setNewEvents([]);
    setShowForm(false);
    setCreating(false);
  }

  async function handleToggle(id: string, enabled: boolean) {
    const r = await wsFetch(`/api/outreach/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    if (r.ok) {
      const updated = await r.json();
      setEndpoints(prev => prev.map(ep => ep.id === id ? updated : ep));
    }
  }

  async function handleDelete(id: string) {
    await wsFetch(`/api/outreach/webhooks/${id}`, { method: "DELETE" });
    setEndpoints(prev => prev.filter(ep => ep.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function handleCopySecret(id: string, secret: string) {
    navigator.clipboard.writeText(secret);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function toggleEvent(value: string) {
    setNewEvents(prev => prev.includes(value) ? prev.filter(e => e !== value) : [...prev, value]);
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-white font-semibold text-lg">Webhook Endpoints</h2>
          <p className="text-white/40 text-sm mt-0.5">
            Send real-time event notifications to your own servers.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setCreateError(null); }}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          + Add Endpoint
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white/4 border border-white/8 rounded-xl p-5 mb-6 space-y-4">
          <h3 className="text-white/70 text-sm font-semibold">New Webhook Endpoint</h3>
          <div>
            <label className="text-white/40 text-xs block mb-1">URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="w-full px-3 py-2 bg-white/6 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/40"
            />
          </div>
          <div>
            <label className="text-white/40 text-xs block mb-2">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev.value} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={newEvents.includes(ev.value)}
                    onChange={() => toggleEvent(ev.value)}
                    className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-orange-500"
                  />
                  <span className="text-white/60 text-xs group-hover:text-white/80 transition-colors">{ev.label}</span>
                </label>
              ))}
            </div>
          </div>
          {createError && <p className="text-red-400 text-xs">⚠ {createError}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowForm(false); setCreateError(null); setNewUrl(""); setNewEvents([]); }}
              className="px-4 py-2 bg-white/6 hover:bg-white/10 text-white/50 text-sm rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {creating ? "Creating…" : "Create Endpoint"}
            </button>
          </div>
        </div>
      )}

      {/* Endpoints list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)}
        </div>
      ) : endpoints.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <div className="text-4xl mb-3">🔗</div>
          <p className="text-sm font-medium">No webhooks configured</p>
          <p className="text-xs mt-1 text-white/20">Add an endpoint to start receiving event notifications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {endpoints.map(ep => (
            <div
              key={ep.id}
              className="bg-white/4 border border-white/8 rounded-xl overflow-hidden"
            >
              {/* Row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Enable toggle */}
                <button
                  onClick={() => handleToggle(ep.id, !ep.enabled)}
                  className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 relative ${ep.enabled ? "bg-emerald-500" : "bg-white/15"}`}
                  title={ep.enabled ? "Disable" : "Enable"}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${ep.enabled ? "left-[18px]" : "left-0.5"}`} />
                </button>
                {/* URL */}
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{ep.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ep.events.map(e => (
                      <span key={e} className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-500/15 text-orange-300 border border-orange-500/20">{e}</span>
                    ))}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setExpandedId(expandedId === ep.id ? null : ep.id)}
                    className="px-2.5 py-1 text-xs text-white/50 hover:text-white/80 bg-white/6 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
                  >
                    {expandedId === ep.id ? "Hide secret" : "Show secret"}
                  </button>
                  <button
                    onClick={() => handleDelete(ep.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 border border-white/8 transition-colors"
                    title="Delete endpoint"
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded secret row */}
              {expandedId === ep.id && (
                <div className="px-4 py-3 border-t border-white/8 bg-white/2">
                  <p className="text-white/40 text-xs mb-2 font-semibold uppercase tracking-wider">Signing Secret</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-xs text-white/70 font-mono break-all">
                      {ep.secret}
                    </code>
                    <button
                      onClick={() => handleCopySecret(ep.id, ep.secret)}
                      className="px-3 py-2 text-xs text-white/50 hover:text-white/80 bg-white/6 hover:bg-white/10 rounded-lg border border-white/10 transition-colors whitespace-nowrap"
                    >
                      {copiedId === ep.id ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-white/25 text-xs mt-2">
                    Use this to verify payloads via the <code className="font-mono">X-Leadash-Signature</code> header (HMAC-SHA256).
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
