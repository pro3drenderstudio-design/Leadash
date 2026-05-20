"use client";

import { useEffect, useState } from "react";

type Settings = Record<string, string>;

const FIELDS = [
  { key: "leadpay_enabled",                label: "LeadPay Enabled",            type: "boolean", hint: "Set to true/false" },
  { key: "leadpay_platform_fee_pct",       label: "Platform Fee (%)",            type: "number",  hint: "% charged on each invoice (e.g. 3)" },
  { key: "leadpay_fx_spread_pct",          label: "FX Spread (%)",               type: "number",  hint: "Spread on USD→NGN conversion (e.g. 2.5)" },
  { key: "leadpay_min_fee_cents",          label: "Minimum Fee (cents)",         type: "number",  hint: "Min fee in USD cents (e.g. 100 = $1.00)" },
  { key: "leadpay_max_invoice_usd",        label: "Max Invoice Amount (USD)",    type: "number",  hint: "Maximum invoice total in USD (e.g. 10000)" },
  { key: "leadpay_min_payout_ngn",         label: "Min Payout (NGN)",            type: "number",  hint: "Minimum NGN payout (e.g. 500)" },
  { key: "leadpay_auto_approve_payout_ngn",label: "Auto-Approve Payout (NGN)", type: "number",  hint: "Auto-approve payouts below this amount" },
  { key: "leadpay_card_creation_fee_cents",label: "Card Creation Fee (cents)",   type: "number",  hint: "USD cents to create a virtual card (e.g. 500)" },
  { key: "leadpay_card_monthly_fee_cents", label: "Card Monthly Fee (cents)",    type: "number",  hint: "Monthly maintenance fee in cents (0 = free)" },
  { key: "leadpay_card_max_per_user",      label: "Max Cards per User",          type: "number",  hint: "Max active cards per workspace (e.g. 5)" },
  { key: "leadpay_fx_rate_override",       label: "FX Rate Override (optional)", type: "number",  hint: "Set to override live rate (leave blank = live)" },
];

export default function AdminLeadPaySettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [draft, setDraft]       = useState<Settings>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    fetch("/api/admin/leadpay/settings")
      .then(r => r.json() as Promise<{ settings: Settings }>)
      .then(d => { setSettings(d.settings ?? {}); setDraft(d.settings ?? {}); })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/admin/leadpay/settings", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(draft),
    });
    setSettings(draft);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  if (loading) {
    return <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-white/4 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">LeadPay Settings</h1>
          <p className="text-white/40 text-sm mt-1">Fee configuration and global controls</p>
        </div>
        <button
          onClick={save}
          disabled={saving || !hasChanges}
          className="px-5 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium hover:bg-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
        </button>
      </div>

      <div className="bg-white/4 rounded-2xl border border-white/8 divide-y divide-white/5">
        {FIELDS.map(f => (
          <div key={f.key} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{f.label}</p>
              <p className="text-xs text-white/30 mt-0.5">{f.hint}</p>
            </div>
            <input
              type={f.type === "boolean" ? "text" : "number"}
              step="any"
              value={draft[f.key] ?? ""}
              onChange={e => setDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="w-32 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white text-right focus:outline-none focus:border-white/30"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
