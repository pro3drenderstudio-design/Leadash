"use client";
import { useEffect, useState } from "react";

const DEFAULTS = {
  footer_enabled:       "true",
  footer_address:       "123 Main Street, New York, NY 10001",
  footer_custom_text:   "You received this email because you or your company expressed interest in our services.",
  track_opens_default:  "true",
  track_clicks_default: "true",
  default_daily_limit:  "30",
  default_timezone:     "America/New_York",
  default_send_start:   "09:00",
  default_send_end:     "17:00",
};

type Settings = typeof DEFAULTS;

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer transition-colors flex-shrink-0 ${checked ? "bg-blue-600" : "bg-white/15"}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </div>
  );
}

export default function OutreachSettingsPage() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    fetch("/api/outreach/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings((prev) => ({ ...prev, ...data }));
        setLoading(false);
      });
  }, []);

  function set(key: keyof Settings, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    await fetch("/api/outreach/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return <div className="p-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-white/4 rounded-xl animate-pulse" />)}</div>;

  const footerEnabled       = settings.footer_enabled === "true";
  const trackOpensDefault   = settings.track_opens_default === "true";
  const trackClicksDefault  = settings.track_clicks_default === "true";

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Outreach Settings</h1>
        <p className="text-white/40 text-sm mt-1">Global defaults applied to all campaigns and sends.</p>
      </div>

      {/* ── Email Footer ───────────────────────────────────────────────────────── */}
      <section className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">Email Footer</h2>
            <p className="text-white/40 text-xs mt-0.5">Appended to every outreach email. Includes unsubscribe link.</p>
          </div>
          <Toggle checked={footerEnabled} onChange={(v) => set("footer_enabled", String(v))} />
        </div>
        <div className={`p-6 space-y-4 transition-opacity ${footerEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Footer Text</label>
            <textarea
              rows={2}
              value={settings.footer_custom_text}
              onChange={(e) => set("footer_custom_text", e.target.value)}
              className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 resize-none"
              placeholder="e.g. You received this email because…"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Physical Address <span className="text-white/30 font-normal normal-case">(required for CAN-SPAM)</span></label>
            <input
              type="text"
              value={settings.footer_address}
              onChange={(e) => set("footer_address", e.target.value)}
              className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50"
              placeholder="123 Main Street, New York, NY 10001"
            />
          </div>
          <div className="bg-white/3 border border-white/6 rounded-xl p-4 text-xs text-white/40 font-mono leading-relaxed">
            <p className="text-white/25 text-[10px] uppercase tracking-wider mb-2">Preview</p>
            <p>{settings.footer_custom_text}</p>
            <p className="mt-1"><span className="text-blue-400/60">Unsubscribe</span> · {settings.footer_address}</p>
          </div>
        </div>
      </section>

      {/* ── Tracking ───────────────────────────────────────────────────────────── */}
      <section className="bg-white/4 border border-white/8 rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Tracking Defaults</h2>
        <p className="text-white/40 text-xs -mt-2">These are defaults for new campaigns. Can be overridden per campaign.</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Track email opens</p>
              <p className="text-white/35 text-xs">Injects a 1px invisible tracking pixel</p>
            </div>
            <Toggle checked={trackOpensDefault} onChange={(v) => set("track_opens_default", String(v))} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Track link clicks</p>
              <p className="text-white/35 text-xs">Wraps links through a redirect for click tracking</p>
            </div>
            <Toggle checked={trackClicksDefault} onChange={(v) => set("track_clicks_default", String(v))} />
          </div>
        </div>
      </section>

      {/* ── Inbox Defaults ─────────────────────────────────────────────────────── */}
      <section className="bg-white/4 border border-white/8 rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Inbox Defaults</h2>
        <p className="text-white/40 text-xs -mt-2">Applied when connecting a new inbox.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Daily send limit</label>
            <input
              type="number" min="1" max="500"
              value={settings.default_daily_limit}
              onChange={(e) => set("default_daily_limit", e.target.value)}
              className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Timezone</label>
            <input
              type="text"
              value={settings.default_timezone}
              onChange={(e) => set("default_timezone", e.target.value)}
              placeholder="America/New_York"
              className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Send window start</label>
            <input type="time" value={settings.default_send_start} onChange={(e) => set("default_send_start", e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-blue-500/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">Send window end</label>
            <input type="time" value={settings.default_send_end} onChange={(e) => set("default_send_end", e.target.value)} className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-blue-500/50" />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
