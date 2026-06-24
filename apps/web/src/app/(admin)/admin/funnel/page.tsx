"use client";
import { useEffect, useState } from "react";

type FunnelSettings = {
  // Pricing
  funnel_challenge_price_ngn:       string;
  funnel_bundle_price_ngn:          string;
  funnel_bundle_duration_months:    string;
  funnel_bundle_offer_days:         string;
  funnel_bundle_inbox_count:        string;
  funnel_bundle_grace_period_days:  string;
  funnel_bundle_renewal_warning_days: string;
  funnel_bundle_paystack_plan_code: string;
  // Content
  funnel_partner_name:     string;
  funnel_mizark_invite_link: string;
  funnel_vsl_youtube_id:   string;
  // Analytics
  meta_pixel_id:           string;
  // Brand / social
  social_twitter_url:      string;
  social_linkedin_url:     string;
  social_instagram_url:    string;
  // WhatsApp credentials
  whatsapp_phone_number_id: string;
  whatsapp_access_token:    string;
  whatsapp_waba_id:         string;
  whatsapp_sender_name:     string;
  whatsapp_max_retry_hours: string;
  whatsapp_24hr_warning_mins: string;
  // WhatsApp approved template names
  wa_template_welcome:            string;
  wa_template_training_reminder:  string;
  wa_template_challenge_enrolled: string;
  wa_template_day1_complete:      string;
  wa_template_bundle_offer:       string;
  wa_template_bundle_purchased:   string;
  wa_template_bundle_expiring:    string;
  wa_template_bundle_renewed:     string;
  // CRM
  crm_support_email:       string;
  crm_marketing_email:     string;
  crm_auto_reopen_on_reply: string;
};

const DEFAULTS: FunnelSettings = {
  funnel_challenge_price_ngn:        "10000",
  funnel_bundle_price_ngn:           "250000",
  funnel_bundle_duration_months:     "12",
  funnel_bundle_offer_days:          "30",
  funnel_bundle_inbox_count:         "20",
  funnel_bundle_grace_period_days:   "7",
  funnel_bundle_renewal_warning_days: "30",
  funnel_bundle_paystack_plan_code:  "",
  funnel_partner_name:               "Learn By Mizark",
  funnel_mizark_invite_link:         "",
  funnel_vsl_youtube_id:             "",
  meta_pixel_id:                     "",
  social_twitter_url:                "",
  social_linkedin_url:               "",
  social_instagram_url:              "",
  whatsapp_phone_number_id:          "",
  whatsapp_access_token:             "",
  whatsapp_waba_id:                  "",
  whatsapp_sender_name:              "Leadash",
  whatsapp_max_retry_hours:          "6",
  whatsapp_24hr_warning_mins:        "60",
  wa_template_welcome:            "",
  wa_template_training_reminder:  "",
  wa_template_challenge_enrolled: "",
  wa_template_day1_complete:      "",
  wa_template_bundle_offer:       "",
  wa_template_bundle_purchased:   "",
  wa_template_bundle_expiring:    "",
  wa_template_bundle_renewed:     "",
  crm_support_email:                 "support@leadash.com",
  crm_marketing_email:               "temi@leadash.com",
  crm_auto_reopen_on_reply:          "true",
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
        {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-slate-200 dark:bg-white/10 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="app-h1">Funnel Settings</h1>
        <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">
          Configure the Leadash × Learn By Mizark course funnel.
        </p>
      </div>

      {/* ── Pricing & Timing ── */}
      <SectionCard
        title="Pricing & Timing"
        hint="Challenge and bundle prices. Changes take effect immediately on the next checkout."
        onSave={() => save("pricing", {
          funnel_challenge_price_ngn:        s.funnel_challenge_price_ngn,
          funnel_bundle_price_ngn:           s.funnel_bundle_price_ngn,
          funnel_bundle_duration_months:     s.funnel_bundle_duration_months,
          funnel_bundle_offer_days:          s.funnel_bundle_offer_days,
          funnel_bundle_inbox_count:         s.funnel_bundle_inbox_count,
          funnel_bundle_grace_period_days:   s.funnel_bundle_grace_period_days,
          funnel_bundle_renewal_warning_days: s.funnel_bundle_renewal_warning_days,
          funnel_bundle_paystack_plan_code:  s.funnel_bundle_paystack_plan_code,
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
        hint="Partner name, WhatsApp invite link, and video IDs for the funnel pages."
        onSave={() => save("content", {
          funnel_partner_name:      s.funnel_partner_name,
          funnel_mizark_invite_link: s.funnel_mizark_invite_link,
          funnel_vsl_youtube_id:    s.funnel_vsl_youtube_id,
          meta_pixel_id:            s.meta_pixel_id,
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
        <FieldRow label="Meta Pixel ID" hint="Your Facebook Pixel ID for tracking opt-ins, video views, and purchases.">
          <TextInput value={s.meta_pixel_id} onChange={v => u("meta_pixel_id", v)} placeholder="123456789012345" mono />
        </FieldRow>
      </SectionCard>

      {/* ── Brand / Social ── */}
      <SectionCard
        title="Social Links"
        hint="Displayed in the website footer. Leave blank to hide that icon."
        onSave={() => save("social", {
          social_twitter_url:   s.social_twitter_url,
          social_linkedin_url:  s.social_linkedin_url,
          social_instagram_url: s.social_instagram_url,
        })}
        saving={saving === "social"}
        saved={saved === "social"}
      >
        <FieldRow label="X / Twitter URL" hint="Full URL e.g. https://twitter.com/leadash">
          <TextInput value={s.social_twitter_url} onChange={v => u("social_twitter_url", v)} placeholder="https://twitter.com/leadash" />
        </FieldRow>
        <FieldRow label="LinkedIn URL" hint="Full URL e.g. https://linkedin.com/company/leadash">
          <TextInput value={s.social_linkedin_url} onChange={v => u("social_linkedin_url", v)} placeholder="https://linkedin.com/company/leadash" />
        </FieldRow>
        <FieldRow label="Instagram URL" hint="Full URL e.g. https://instagram.com/leadash">
          <TextInput value={s.social_instagram_url} onChange={v => u("social_instagram_url", v)} placeholder="https://instagram.com/leadash" />
        </FieldRow>
      </SectionCard>

      {/* ── WhatsApp ── */}
      <SectionCard
        title="WhatsApp (Meta Cloud API)"
        hint="Credentials for sending WhatsApp messages. Never share these."
        onSave={() => save("whatsapp", {
          whatsapp_phone_number_id:  s.whatsapp_phone_number_id,
          whatsapp_access_token:     s.whatsapp_access_token,
          whatsapp_waba_id:          s.whatsapp_waba_id,
          whatsapp_sender_name:      s.whatsapp_sender_name,
          whatsapp_max_retry_hours:  s.whatsapp_max_retry_hours,
          whatsapp_24hr_warning_mins: s.whatsapp_24hr_warning_mins,
        })}
        saving={saving === "whatsapp"}
        saved={saved === "whatsapp"}
      >
        <FieldRow label="Phone Number ID" hint="From Meta Business Suite → WhatsApp → Phone numbers.">
          <TextInput value={s.whatsapp_phone_number_id} onChange={v => u("whatsapp_phone_number_id", v)} placeholder="1234567890123456" mono />
        </FieldRow>
        <FieldRow label="Permanent access token" hint="System user token from Meta. Never expires if created via a System User.">
          <TextInput value={s.whatsapp_access_token} onChange={v => u("whatsapp_access_token", v)} placeholder="EAAxxxxxxx..." mono />
        </FieldRow>
        <FieldRow label="WABA ID" hint="WhatsApp Business Account ID.">
          <TextInput value={s.whatsapp_waba_id} onChange={v => u("whatsapp_waba_id", v)} placeholder="1234567890123456" mono />
        </FieldRow>
        <FieldRow label="Sender display name" hint="The name shown to recipients when sending template messages.">
          <TextInput value={s.whatsapp_sender_name} onChange={v => u("whatsapp_sender_name", v)} placeholder="Leadash" />
        </FieldRow>
        <FieldRow label="Max retry window (hours)" hint="How long to keep retrying a failed WhatsApp send before flagging for review.">
          <NumInput value={s.whatsapp_max_retry_hours} onChange={v => u("whatsapp_max_retry_hours", v)} min={1} max={72} />
        </FieldRow>
        <FieldRow label="24-hour window warning (mins before)" hint="Show a warning in the CRM this many minutes before the 24-hour free-messaging window closes.">
          <NumInput value={s.whatsapp_24hr_warning_mins} onChange={v => u("whatsapp_24hr_warning_mins", v)} min={5} max={1440} />
        </FieldRow>
      </SectionCard>

      {/* ── WhatsApp Templates ── */}
      <SectionCard
        title="WhatsApp Template Names"
        hint="Exact template names approved by Meta. Leave blank until Meta approves — automations will skip WA sends gracefully. Template params are configured in each automation node."
        onSave={() => save("wa_templates", {
          wa_template_welcome:            s.wa_template_welcome,
          wa_template_training_reminder:  s.wa_template_training_reminder,
          wa_template_challenge_enrolled: s.wa_template_challenge_enrolled,
          wa_template_day1_complete:      s.wa_template_day1_complete,
          wa_template_bundle_offer:       s.wa_template_bundle_offer,
          wa_template_bundle_purchased:   s.wa_template_bundle_purchased,
          wa_template_bundle_expiring:    s.wa_template_bundle_expiring,
          wa_template_bundle_renewed:     s.wa_template_bundle_renewed,
        })}
        saving={saving === "wa_templates"}
        saved={saved === "wa_templates"}
      >
        <div className="mb-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Templates must be submitted and approved in Meta Business Manager before use. Name must match exactly (case-sensitive, underscores).
        </div>
        <FieldRow label="Welcome (after opt-in)" hint="Sent when user opts in — outside 24hr window.">
          <TextInput value={s.wa_template_welcome} onChange={v => u("wa_template_welcome", v)} placeholder="leadash_welcome" mono />
        </FieldRow>
        <FieldRow label="Training reminder" hint="Sent ~1hr after opt-in to encourage watching the VSL.">
          <TextInput value={s.wa_template_training_reminder} onChange={v => u("wa_template_training_reminder", v)} placeholder="leadash_training_reminder" mono />
        </FieldRow>
        <FieldRow label="Challenge enrolled" hint="Sent on challenge purchase confirmation.">
          <TextInput value={s.wa_template_challenge_enrolled} onChange={v => u("wa_template_challenge_enrolled", v)} placeholder="leadash_challenge_enrolled" mono />
        </FieldRow>
        <FieldRow label="Day 1 complete" hint="Sent when student completes Day 1 lesson.">
          <TextInput value={s.wa_template_day1_complete} onChange={v => u("wa_template_day1_complete", v)} placeholder="leadash_day1_complete" mono />
        </FieldRow>
        <FieldRow label="Bundle offer reminder" hint="Upsell nudge during the 30-day offer window.">
          <TextInput value={s.wa_template_bundle_offer} onChange={v => u("wa_template_bundle_offer", v)} placeholder="leadash_bundle_offer" mono />
        </FieldRow>
        <FieldRow label="Bundle purchased" hint="Sent on bundle purchase confirmation.">
          <TextInput value={s.wa_template_bundle_purchased} onChange={v => u("wa_template_bundle_purchased", v)} placeholder="leadash_bundle_purchased" mono />
        </FieldRow>
        <FieldRow label="Bundle expiring (7-day)" hint="7-day expiry warning before annual renewal.">
          <TextInput value={s.wa_template_bundle_expiring} onChange={v => u("wa_template_bundle_expiring", v)} placeholder="leadash_bundle_expiring" mono />
        </FieldRow>
        <FieldRow label="Bundle renewed" hint="Sent on successful annual renewal charge.">
          <TextInput value={s.wa_template_bundle_renewed} onChange={v => u("wa_template_bundle_renewed", v)} placeholder="leadash_bundle_renewed" mono />
        </FieldRow>
      </SectionCard>

      {/* ── CRM ── */}
      <SectionCard
        title="CRM Inbox"
        hint="Email addresses used by the Leadash team CRM inbox."
        onSave={() => save("crm", {
          crm_support_email:       s.crm_support_email,
          crm_marketing_email:     s.crm_marketing_email,
          crm_auto_reopen_on_reply: s.crm_auto_reopen_on_reply,
        })}
        saving={saving === "crm"}
        saved={saved === "crm"}
      >
        <FieldRow label="Support inbox email" hint="Inbound emails to this address appear in the Support inbox.">
          <TextInput value={s.crm_support_email} onChange={v => u("crm_support_email", v)} placeholder="support@leadash.com" type="email" />
        </FieldRow>
        <FieldRow label="Marketing inbox email" hint="Inbound emails to this address appear in the Marketing inbox.">
          <TextInput value={s.crm_marketing_email} onChange={v => u("crm_marketing_email", v)} placeholder="temi@leadash.com" type="email" />
        </FieldRow>
        <FieldRow label="Auto-reopen on reply" hint="Automatically reopen a resolved conversation when the customer replies.">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/10 rounded-lg">
            {(["true", "false"] as const).map(v => (
              <button
                key={v}
                onClick={() => u("crm_auto_reopen_on_reply", v)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  s.crm_auto_reopen_on_reply === v
                    ? "bg-white dark:bg-white/20 text-slate-800 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/60"
                }`}
              >
                {v === "true" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </FieldRow>
      </SectionCard>
    </div>
  );
}
