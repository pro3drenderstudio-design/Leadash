"use client";
import { useEffect, useState } from "react";

type FunnelSettings = {
  funnel_challenge_price_ngn:         string;
  funnel_bundle_price_ngn:            string;
  funnel_bundle_duration_months:      string;
  funnel_bundle_offer_days:           string;
  funnel_bundle_inbox_count:          string;
  funnel_bundle_grace_period_days:    string;
  funnel_bundle_renewal_warning_days: string;
  funnel_bundle_paystack_plan_code:   string;
  funnel_partner_name:                string;
  funnel_mizark_invite_link:          string;
  funnel_vsl_youtube_id:              string;
};

const DEFAULTS: FunnelSettings = {
  funnel_challenge_price_ngn:         "10000",
  funnel_bundle_price_ngn:            "250000",
  funnel_bundle_duration_months:      "12",
  funnel_bundle_offer_days:           "30",
  funnel_bundle_inbox_count:          "20",
  funnel_bundle_grace_period_days:    "7",
  funnel_bundle_renewal_warning_days: "30",
  funnel_bundle_paystack_plan_code:   "",
  funnel_partner_name:                "Learn By Mizark",
  funnel_mizark_invite_link:          "",
  funnel_vsl_youtube_id:              "",
};

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-8 py-4 border-b border-slate-100 dark:border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-white/80">{label}</p>
        {hint && <p className="text-xs text-slate-400 dark:text-white/30 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SectionCard({ title, hint, children, onSave, saving, saved }: {
  title: string; hint?: string; children: React.ReactNode;
  onSave: () => void; saving: boolean; saved: boolean;
}) {
  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h2>
        {hint && <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">{hint}</p>}
      </div>
      {children}
      <div className="pt-4 flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            saved
              ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"
              : "bg-orange-500 text-white hover:bg-orange-400 disabled:opacity-50"
          }`}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", mono = false }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-72 px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 ${mono ? "font-mono text-xs" : ""}`}
    />
  );
}

function NumInput({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      min={min}
      max={max}
      className="w-28 px-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-orange-500/30"
    />
  );
}

export default function FunnelSettingsPage() {
  const [s,       setS]       = useState<FunnelSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null);
  const [saved,   setSaved]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/funnel-settings")
      .then(r => r.json())
      .then((d: { settings?: Record<string, unknown> }) => {
        const raw = d.settings ?? {};
        setS(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(raw).map(([k, v]) => [k, String(v ?? "")])
          ),
        }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function u(key: keyof FunnelSettings, value: string) {
    setS(prev => ({ ...prev, [key]: value }));
  }

  async function save(section: string, patch: Partial<Record<keyof FunnelSettings, string>>) {
    setSaving(section);
    setSaved(null);
    const res = await fetch("/api/admin/funnel-settings", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
    const d = await res.json() as { error?: string };
    setSaving(null);
    if (!res.ok) { alert(d.error ?? "Save failed"); return; }
    setSaved(section);
    setTimeout(() => setSaved(null), 2500);
  }

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-4">
        {[1, 2].map(i => <div key={i} className="h-48 bg-slate-200 dark:bg-white/10 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="app-h1">Challenge Funnel</h1>
        <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">
          Pricing and content for the 30-Day Challenge → Annual Bundle flow. Will move into the funnel builder once that flow migrates.
        </p>
      </div>

      {/* ── Pricing & Timing ── */}
      <SectionCard
        title="Pricing & Timing"
        hint="Challenge and bundle prices. Changes take effect immediately on the next checkout."
        onSave={() => save("pricing", {
          funnel_challenge_price_ngn:         s.funnel_challenge_price_ngn,
          funnel_bundle_price_ngn:            s.funnel_bundle_price_ngn,
          funnel_bundle_duration_months:      s.funnel_bundle_duration_months,
          funnel_bundle_offer_days:           s.funnel_bundle_offer_days,
          funnel_bundle_inbox_count:          s.funnel_bundle_inbox_count,
          funnel_bundle_grace_period_days:    s.funnel_bundle_grace_period_days,
          funnel_bundle_renewal_warning_days: s.funnel_bundle_renewal_warning_days,
          funnel_bundle_paystack_plan_code:   s.funnel_bundle_paystack_plan_code,
        })}
        saving={saving === "pricing"}
        saved={saved === "pricing"}
      >
        <FieldRow label="30-Day Challenge price (₦)" hint="One-time payment for the challenge enrollment.">
          <NumInput value={s.funnel_challenge_price_ngn} onChange={v => u("funnel_challenge_price_ngn", v)} min={0} />
        </FieldRow>
        <FieldRow label="Annual Bundle price (₦)" hint="Annual subscription price for the full bundle.">
          <NumInput value={s.funnel_bundle_price_ngn} onChange={v => u("funnel_bundle_price_ngn", v)} min={0} />
        </FieldRow>
        <FieldRow label="Bundle duration (months)" hint="How long the annual bundle subscription lasts.">
          <NumInput value={s.funnel_bundle_duration_months} onChange={v => u("funnel_bundle_duration_months", v)} min={1} max={36} />
        </FieldRow>
        <FieldRow label="Bundle offer window (days)" hint="Days from challenge enrollment before the bundle offer expires.">
          <NumInput value={s.funnel_bundle_offer_days} onChange={v => u("funnel_bundle_offer_days", v)} min={1} max={365} />
        </FieldRow>
        <FieldRow label="Bundle inbox credits" hint="Number of inbox credits granted with the annual bundle.">
          <NumInput value={s.funnel_bundle_inbox_count} onChange={v => u("funnel_bundle_inbox_count", v)} min={0} />
        </FieldRow>
        <FieldRow label="Grace period after failed renewal (days)" hint="Days of continued access before downgrade on failed payment.">
          <NumInput value={s.funnel_bundle_grace_period_days} onChange={v => u("funnel_bundle_grace_period_days", v)} min={0} max={30} />
        </FieldRow>
        <FieldRow label="Renewal warning (days before expiry)" hint="How many days in advance to warn the user about upcoming bundle renewal.">
          <NumInput value={s.funnel_bundle_renewal_warning_days} onChange={v => u("funnel_bundle_renewal_warning_days", v)} min={1} max={90} />
        </FieldRow>
        <FieldRow label="Paystack annual plan code" hint="PLN_xxx code from your Paystack dashboard for the annual bundle subscription.">
          <TextInput value={s.funnel_bundle_paystack_plan_code} onChange={v => u("funnel_bundle_paystack_plan_code", v)} placeholder="PLN_xxxxxxxxxxxxxxxx" mono />
        </FieldRow>
      </SectionCard>

      {/* ── Content & Links ── */}
      <SectionCard
        title="Content & Links"
        hint="Partner name, WhatsApp invite link, and video ID for the funnel pages."
        onSave={() => save("content", {
          funnel_partner_name:      s.funnel_partner_name,
          funnel_mizark_invite_link: s.funnel_mizark_invite_link,
          funnel_vsl_youtube_id:    s.funnel_vsl_youtube_id,
        })}
        saving={saving === "content"}
        saved={saved === "content"}
      >
        <FieldRow label="Partner name" hint="Displayed as 'Leadash × [Partner name]' on funnel pages.">
          <TextInput value={s.funnel_partner_name} onChange={v => u("funnel_partner_name", v)} placeholder="Learn By Mizark" />
        </FieldRow>
        <FieldRow label="WhatsApp community invite link" hint="The shared invite link sent to bundle subscribers (WhatsApp group).">
          <TextInput value={s.funnel_mizark_invite_link} onChange={v => u("funnel_mizark_invite_link", v)} placeholder="https://chat.whatsapp.com/..." />
        </FieldRow>
        <FieldRow label="VSL YouTube video ID" hint="The 11-character YouTube video ID for the free training VSL.">
          <TextInput value={s.funnel_vsl_youtube_id} onChange={v => u("funnel_vsl_youtube_id", v)} placeholder="dQw4w9WgXcQ" mono />
        </FieldRow>
      </SectionCard>
    </div>
  );
}
