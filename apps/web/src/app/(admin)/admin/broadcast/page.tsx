"use client";
import { useState } from "react";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.io";

const V2_TEMPLATE = {
  subject: "Introducing Leadash v2.0 — Your outreach just got a whole lot smarter",
  html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#374151;background:#fff">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f0f0f 0%,#1a1a1a 50%,#111 100%);padding:40px 40px 32px;border-radius:16px 16px 0 0;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:20px">
      <span style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-1px">Leadash</span>
      <span style="font-size:9px;font-weight:700;text-transform:uppercase;background:rgba(249,115,22,0.15);color:#fb923c;border:1px solid rgba(249,115,22,0.25);padding:3px 8px;border-radius:4px;letter-spacing:1px">v2.0</span>
    </div>
    <p style="color:#f97316;font-size:16px;font-weight:700;margin:0 0 8px">Version 2.0 is here</p>
    <p style="color:#ffffff80;font-size:13px;margin:0">More power. More control. Better results.</p>
  </div>

  <!-- Body -->
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:40px">
    <p style="font-size:16px;margin-top:0">Hi there,</p>
    <p style="color:#4b5563;line-height:1.7">We've been heads-down building, and today we're excited to share everything that's new in <strong style="color:#111">Leadash v2.0</strong> — the biggest update since we launched.</p>

    <!-- Feature list -->
    <div style="margin:28px 0">
      <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:16px">What's new</p>

      <div style="display:flex;gap:14px;margin-bottom:18px;align-items:flex-start">
        <div style="width:36px;height:36px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">📬</div>
        <div>
          <p style="font-weight:600;color:#111;margin:0 0 4px;font-size:15px">Custom sending domains</p>
          <p style="color:#6b7280;font-size:14px;margin:0;line-height:1.6">Send from your own domain with full DKIM, SPF and DMARC setup — built right into Leadash.</p>
        </div>
      </div>

      <div style="display:flex;gap:14px;margin-bottom:18px;align-items:flex-start">
        <div style="width:36px;height:36px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">🤖</div>
        <div>
          <p style="font-weight:600;color:#111;margin:0 0 4px;font-size:15px">AI sequence builder</p>
          <p style="color:#6b7280;font-size:14px;margin:0;line-height:1.6">Describe your product and audience — our AI writes a full multi-step email sequence for you in seconds.</p>
        </div>
      </div>

      <div style="display:flex;gap:14px;margin-bottom:18px;align-items:flex-start">
        <div style="width:36px;height:36px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">💬</div>
        <div>
          <p style="font-weight:600;color:#111;margin:0 0 4px;font-size:15px">Built-in reply CRM</p>
          <p style="color:#6b7280;font-size:14px;margin:0;line-height:1.6">Track every reply, categorise leads as Interested / Not Interested / Meeting Booked, and reply directly from Leadash.</p>
        </div>
      </div>

      <div style="display:flex;gap:14px;margin-bottom:18px;align-items:flex-start">
        <div style="width:36px;height:36px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">🔥</div>
        <div>
          <p style="font-weight:600;color:#111;margin:0 0 4px;font-size:15px">Inbox warmup</p>
          <p style="color:#6b7280;font-size:14px;margin:0;line-height:1.6">Automated warmup keeps your sending reputation healthy and your emails out of spam.</p>
        </div>
      </div>

      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="width:36px;height:36px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">⚡</div>
        <div>
          <p style="font-weight:600;color:#111;margin:0 0 4px;font-size:15px">Lead enrichment credits</p>
          <p style="color:#6b7280;font-size:14px;margin:0;line-height:1.6">Find, verify and import leads from Apollo, LinkedIn and more — all inside your dashboard.</p>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:24px;margin:32px 0;text-align:center">
      <p style="font-size:15px;font-weight:600;color:#9a3412;margin:0 0 6px">Your dashboard is ready</p>
      <p style="color:#c2410c;font-size:14px;margin:0 0 20px">Everything is live. Log in to explore the new features.</p>
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#f97316;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">Open Dashboard →</a>
    </div>

    <p style="color:#6b7280;font-size:14px;line-height:1.7">We built Leadash to make outreach accessible for African and emerging-market businesses — and v2.0 is our biggest step toward that goal yet. We'd love to hear your feedback.</p>
    <p style="color:#6b7280;font-size:14px">Just reply to this email. We read every one.</p>

    <p style="color:#9ca3af;font-size:12px;margin-top:36px;border-top:1px solid #e5e7eb;padding-top:20px">
      — The Leadash Team<br>
      <a href="${APP_URL}" style="color:#f97316">${APP_URL}</a>
    </p>
  </div>
</div>
  `.trim(),
  text: `Hi there,

We've been heads-down building, and today we're excited to share everything that's new in Leadash v2.0 — the biggest update since we launched.

What's new:

📬 Custom sending domains — Send from your own domain with full DKIM, SPF and DMARC setup.

🤖 AI sequence builder — Describe your product and audience; our AI writes a full email sequence in seconds.

💬 Built-in reply CRM — Track every reply, categorise leads, and reply directly from Leadash.

🔥 Inbox warmup — Automated warmup keeps your reputation healthy and emails out of spam.

⚡ Lead enrichment credits — Find, verify and import leads from Apollo, LinkedIn and more.

Your dashboard is ready:
${APP_URL}/dashboard

We built Leadash to make outreach accessible for African and emerging-market businesses — and v2.0 is our biggest step toward that goal yet. We'd love to hear your feedback. Just reply to this email.

— The Leadash Team
${APP_URL}`,
};

interface SendResult {
  total: number;
  page_count: number;
  offset: number;
  next_offset: number | null;
  sent: number;
  failed: number;
  succeeded: string[];
  errors: string[];
}

interface PreviewResult {
  count: number;
  page_count: number;
  offset: number;
  sample: string[];
}

export default function BroadcastPage() {
  const [subject,  setSubject]  = useState(V2_TEMPLATE.subject);
  const [html,     setHtml]     = useState(V2_TEMPLATE.html);
  const [text,     setText]     = useState(V2_TEMPLATE.text);
  const [filter,     setFilter]     = useState<"all" | "active">("all");
  const [tab,        setTab]        = useState<"html" | "text" | "preview">("html");
  const [batchLimit, setBatchLimit] = useState<string>("10");
  const [offset,     setOffset]     = useState<number>(0);

  const [previewing, setPreviewing] = useState(false);
  const [sending,    setSending]    = useState(false);
  const [preview,    setPreview]    = useState<PreviewResult | null>(null);
  const [result,     setResult]     = useState<SendResult | null>(null);
  const [allResults, setAllResults] = useState<SendResult[]>([]);
  const [error,      setError]      = useState("");
  const [confirmed,  setConfirmed]  = useState(false);

  const limitNum = parseInt(batchLimit) || 0;

  async function handlePreview() {
    setPreviewing(true);
    setError("");
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html, text, filter, preview: true, limit: limitNum || undefined, offset }),
      });
      const d = await res.json() as PreviewResult & { error?: string };
      if (!res.ok) { setError(d.error ?? "Preview failed"); return; }
      setPreview(d);
    } catch {
      setError("Network error");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSend() {
    if (!confirmed) return;
    setSending(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html, text, filter, limit: limitNum || undefined, offset }),
      });
      const d = await res.json() as SendResult & { error?: string };
      if (!res.ok) { setError(d.error ?? "Send failed"); return; }
      setResult(d);
      setAllResults(prev => [...prev, d]);
      setConfirmed(false);
      // Auto-advance offset for next batch
      if (d.next_offset !== null) setOffset(d.next_offset);
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  // All succeeded emails across all batches sent this session
  const allSucceeded = allResults.flatMap(r => r.succeeded);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Broadcast Email</h1>
        <p className="text-sm text-slate-400 dark:text-white/40 mt-1">Send an email to all users or a filtered subset via Resend.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Compose ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Subject */}
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/20 outline-none focus:border-orange-400 dark:focus:border-orange-500/60 transition-colors"
              placeholder="Email subject…"
            />
          </div>

          {/* Body tabs */}
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
            <div className="flex border-b border-slate-200 dark:border-white/10">
              {(["html", "text", "preview"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    tab === t
                      ? "text-orange-500 border-b-2 border-orange-500 bg-orange-50 dark:bg-orange-500/5"
                      : "text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50"
                  }`}
                >
                  {t === "preview" ? "Preview" : t.toUpperCase()}
                </button>
              ))}
            </div>

            {tab === "html" && (
              <textarea
                value={html}
                onChange={e => setHtml(e.target.value)}
                rows={18}
                className="w-full p-4 text-xs font-mono text-slate-700 dark:text-white/70 bg-slate-50 dark:bg-white/[0.02] outline-none resize-y"
                placeholder="HTML body…"
              />
            )}
            {tab === "text" && (
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={18}
                className="w-full p-4 text-sm text-slate-700 dark:text-white/70 bg-slate-50 dark:bg-white/[0.02] outline-none resize-y leading-relaxed"
                placeholder="Plain text fallback…"
              />
            )}
            {tab === "preview" && (
              <div className="p-4 bg-slate-50 dark:bg-white/[0.02]">
                <iframe
                  srcDoc={html}
                  className="w-full border border-slate-200 dark:border-white/10 rounded-lg bg-white"
                  style={{ height: 480 }}
                  sandbox="allow-same-origin"
                  title="Email preview"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Settings + Actions ── */}
        <div className="space-y-5">

          {/* Audience */}
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-3">Audience</p>
            <div className="space-y-2">
              {(["all", "active"] as const).map(f => (
                <label key={f} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="filter"
                    value={f}
                    checked={filter === f}
                    onChange={() => setFilter(f)}
                    className="accent-orange-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-white/70">
                    {f === "all" ? "All confirmed users" : "Active users (have a workspace)"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-3">Dry Run</p>
            <button
              onClick={handlePreview}
              disabled={previewing}
              className="w-full py-2 text-sm font-semibold rounded-lg border border-slate-200 dark:border-white/15 text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-all"
            >
              {previewing ? "Checking…" : "Check recipient count"}
            </button>
            {preview && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-white/5 rounded-lg">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{preview.count.toLocaleString()} recipients</p>
                {preview.sample.length > 0 && (
                  <p className="text-xs text-slate-400 dark:text-white/30 mt-1 leading-relaxed">
                    {preview.sample.join(", ")}{preview.count > preview.sample.length ? `, +${preview.count - preview.sample.length} more` : ""}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Send */}
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-500 dark:text-white/40 uppercase tracking-wider mb-3">Send</p>
            <label className="flex items-start gap-2.5 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <span className="text-xs text-slate-500 dark:text-white/40 leading-relaxed">
                I confirm I want to send this email to {filter === "all" ? "all confirmed users" : "all active users"}. This cannot be undone.
              </span>
            </label>
            <button
              onClick={handleSend}
              disabled={!confirmed || sending || !subject.trim() || !html.trim() || !text.trim()}
              className="w-full py-2.5 text-sm font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {sending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Sending…
                </span>
              ) : "Send broadcast"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="p-4 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">Broadcast complete</p>
              <p className="text-xs text-green-600 dark:text-green-400/70">{result.sent} sent · {result.failed} failed · {result.total} total</p>
              {result.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-red-500 cursor-pointer">Show errors ({result.errors.length})</summary>
                  <ul className="mt-1 space-y-0.5">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-red-400 font-mono">{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
