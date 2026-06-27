// ─── Grants — discriminated union, the core building block of an offer ────────

export interface PlanGrant      { id: string; type: "plan";      tier: "starter" | "growth" | "scale"; months: number }
export interface InboxGrant     { id: string; type: "inbox";     qty: number; freeMonths: number; after: "bill" | "free" | "cancel" }
export interface CreditsGrant   { id: string; type: "credits";   qty: number; recurring: boolean }
export interface CommunityGrant { id: string; type: "community"; inviteUrl: string; label: string }
export interface AcademyGrant   { id: string; type: "academy";   productId: string; label: string }
export interface IpGrant        { id: string; type: "ip";        label: string }
export interface SeatsGrant     { id: string; type: "seats";     qty: number }
export interface CustomGrant    { id: string; type: "custom";    label: string; description: string }

export type OfferGrant =
  | PlanGrant | InboxGrant | CreditsGrant | CommunityGrant
  | AcademyGrant | IpGrant | SeatsGrant | CustomGrant;

export type OfferGrantType = OfferGrant["type"];

export const GRANT_TYPES: OfferGrantType[] = [
  "plan", "inbox", "credits", "community", "academy", "ip", "seats", "custom",
];

export function defaultGrant(type: OfferGrantType): OfferGrant {
  const id = (globalThis.crypto?.randomUUID?.() ?? `g_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  switch (type) {
    case "plan":      return { id, type, tier: "growth", months: 12 };
    case "inbox":     return { id, type, qty: 10, freeMonths: 3, after: "bill" };
    case "credits":   return { id, type, qty: 1000, recurring: false };
    case "community": return { id, type, inviteUrl: "", label: "Private community" };
    case "academy":   return { id, type, productId: "", label: "Academy product" };
    case "ip":        return { id, type, label: "Dedicated sending IP" };
    case "seats":     return { id, type, qty: 1 };
    case "custom":    return { id, type, label: "Custom perk", description: "" };
  }
}

// ─── Bumps / upsells / buyer fields ────────────────────────────────────────────

export interface OfferBump {
  id: string;
  grant: OfferGrant;
  label: string;
  price_ngn: number;
  recurring: boolean;
  is_active: boolean;
}

export interface OfferUpsell {
  id: string;
  label: string;
  description: string;
  price_ngn: number;
  grant: OfferGrant | null;
  kind: "upsell" | "downsell";
  is_active: boolean;
}

export interface BuyerField {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
  type: "text" | "email" | "tel" | "select";
  options?: string[];
}

export const DEFAULT_BUYER_FIELDS: BuyerField[] = [
  { key: "full_name", label: "Full name",            enabled: true,  required: true,  type: "text" },
  { key: "email",     label: "Email",                enabled: true,  required: true,  type: "email" },
  { key: "phone",     label: "Phone / WhatsApp",     enabled: true,  required: false, type: "tel" },
  { key: "company",   label: "Company (optional)",   enabled: false, required: false, type: "text" },
  { key: "source",    label: "How did you hear about us?", enabled: false, required: false, type: "text" },
];

// ─── Checkout page config ───────────────────────────────────────────────────────

export interface OfferCheckoutConfig {
  headline: string;
  subhead: string;
  badge: string;
  layout: "two_col" | "single" | "long";
  show_value_stack: boolean;
  show_countdown: boolean;
  show_testimonials: boolean;
  show_guarantee: boolean;
  fields: BuyerField[];
}

export const DEFAULT_CHECKOUT_CONFIG: OfferCheckoutConfig = {
  headline: "",
  subhead: "",
  badge: "",
  layout: "two_col",
  show_value_stack: true,
  show_countdown: false,
  show_testimonials: true,
  show_guarantee: true,
  fields: DEFAULT_BUYER_FIELDS,
};

// ─── Discount codes ──────────────────────────────────────────────────────────────

export interface OfferDiscountCode {
  id: string;
  offer_id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  max_redemptions: number | null;
  manual_only: boolean;
  is_active: boolean;
  redemptions: number;
  created_at: string;
}

// ─── Installments ────────────────────────────────────────────────────────────────

export interface OfferInstallments {
  count: number;
  amount_ngn: number;
}

// ─── Core Offer ──────────────────────────────────────────────────────────────────

export type OfferStatus = "draft" | "active" | "paused";
export type PricingModel = "one_time" | "recurring" | "trial" | "free" | "payment_plan" | "pwyw";
export type CurrencyMode = "auto" | "ngn_only" | "usd_only";
export type BillingInterval = "monthly" | "quarterly" | "annual";
export type OnExpireBehavior = "hide_button" | "waitlist" | "full_price";
export type NoWorkspaceAction = "create" | "invite" | "attach_by_email";
export type AfterPurchaseAction = "confirmation" | "custom_url" | "dashboard";

export interface Offer {
  id: string;
  slug: string;
  name: string;
  status: OfferStatus;

  pricing_model: PricingModel;
  price_ngn: number;
  compare_at_ngn: number | null;
  currency_mode: CurrencyMode;
  billing_interval: BillingInterval | null;
  trial_days: number | null;
  installments: OfferInstallments | null;
  pwyw_min_ngn: number | null;

  grants: OfferGrant[];
  bumps: OfferBump[];
  upsell: OfferUpsell | null;
  downsell: OfferUpsell | null;

  checkout: OfferCheckoutConfig;

  expires_at: string | null;
  on_expire: OnExpireBehavior;
  stock_limit: number | null;
  recover_abandoned: boolean;

  auto_grant: boolean;
  manual_approval: boolean;
  no_workspace_action: NoWorkspaceAction;
  after_purchase: AfterPurchaseAction;
  custom_url: string | null;
  send_receipt: boolean;
  send_whatsapp: boolean;
  notify_admin: boolean;
  refund_window_days: number;

  funnel_ids: string[];

  views_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Purchases ────────────────────────────────────────────────────────────────────

export interface OfferLineItem {
  kind: "base" | "bump" | "upsell" | "downsell";
  label: string;
  amount_ngn: number;
}

export interface GrantedItem {
  grant_id: string;
  type: OfferGrantType;
  status: "granted" | "pending_manual" | "failed";
  detail?: string;
}

export type PurchaseStatus = "pending" | "paid" | "refunded" | "failed";

export interface OfferPurchase {
  id: string;
  offer_id: string;
  workspace_id: string | null;
  user_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  line_items: OfferLineItem[];
  discount_code_id: string | null;
  subtotal_ngn: number;
  discount_ngn: number;
  total_ngn: number;
  currency: "NGN" | "USD";
  paystack_reference: string | null;
  status: PurchaseStatus;
  granted_items: GrantedItem[];
  manual_approval_status: "pending" | "approved" | "rejected" | null;
  upsell_status: "offered" | "accepted" | "declined" | null;
  downsell_status: "offered" | "accepted" | "declined" | null;
  granted_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

// ─── Rollup / analytics view types ───────────────────────────────────────────────

export interface OfferWithStats extends Offer {
  views: number;
  sales: number;
  revenue_ngn: number;
  conversion_rate: number;
}

export interface OfferAnalytics {
  tiles: {
    revenue_ngn: number;
    sales: number;
    checkout_views: number;
    conversion_rate: number;
    refund_rate: number;
  };
  revenue_trend: { date: string; revenue_ngn: number }[];
  checkout_funnel: { stage: "view" | "started" | "payment_added" | "purchased"; count: number; pct: number }[];
  revenue_by_grant: { label: string; amount_ngn: number; color: string }[];
  discount_code_performance: { code: string; redemptions: number; revenue_ngn: number }[];
}

// ─── Grant registry (labels, colors, icons live in the UI layer; this is shared metadata) ──

export const GRANT_LABELS: Record<OfferGrantType, string> = {
  plan: "Leadash Plan",
  inbox: "Inbox Credits",
  credits: "Lead Credits",
  community: "Community Access",
  academy: "Academy Product",
  ip: "Dedicated IP",
  seats: "Team Seats",
  custom: "Custom Perk",
};

export const GRANT_COLORS: Record<OfferGrantType, string> = {
  plan: "#60A5FA",
  inbox: "#F97316",
  credits: "#A78BFA",
  community: "#34D399",
  academy: "#F472B6",
  ip: "#22D3EE",
  seats: "#FBBF24",
  custom: "#9A9AA8",
};

export function grantLine(g: OfferGrant): string {
  switch (g.type) {
    case "plan":      return `${g.tier[0].toUpperCase()}${g.tier.slice(1)} plan · ${g.months} month${g.months > 1 ? "s" : ""}`;
    case "inbox":     return `${g.qty} sending inboxes${g.freeMonths ? ` · free for ${g.freeMonths} months` : ""}`;
    case "credits":   return `${g.qty.toLocaleString()} lead credits${g.recurring ? " / month" : ""}`;
    case "seats":     return `${g.qty} team seat${g.qty > 1 ? "s" : ""}`;
    case "community": return g.label || "Community access";
    case "academy":   return g.label || "Academy product";
    case "ip":        return g.label || "Dedicated sending IP";
    case "custom":    return g.label || "Custom perk";
  }
}

export function formatOfferPrice(naira: number, currency: "NGN" | "USD" = "NGN", usdRate = 1500): string {
  if (naira === 0) return currency === "USD" ? "$0" : "Free";
  if (currency === "USD") return `$${Math.round(naira / usdRate).toLocaleString()}`;
  return `₦${naira.toLocaleString("en-NG")}`;
}
