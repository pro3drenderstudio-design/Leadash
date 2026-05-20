// ── LeadPay types ─────────────────────────────────────────────────────────────

export type LeadPayKycStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected"
  | "needs_more_info";

export type LeadPayAccountStatus = "pending" | "active" | "suspended" | "rejected";
export type LeadPayAccountType   = "individual" | "business";

export interface LeadPayAccount {
  id:                   string;
  workspace_id:         string;
  account_type:         LeadPayAccountType;
  status:               LeadPayAccountStatus;
  kyc_status:           LeadPayKycStatus;
  kyc_rejection_reason: string | null;
  kyc_submitted_at:     string | null;

  legal_first_name: string | null;
  legal_last_name:  string | null;
  date_of_birth:    string | null;
  phone:            string | null;
  profession:       string | null;

  business_name: string | null;
  rc_number:     string | null;
  business_type: string | null;
  website:       string | null;

  display_name:           string | null;
  logo_url:               string | null;
  brand_color:            string;
  invoice_footer:         string | null;
  invoice_note_template:  string | null;

  usd_balance_cents:  number;
  usd_pending_cents:  number;

  created_at: string;
  updated_at: string;
}

export interface LeadPayBankAccount {
  id:             string;
  workspace_id:   string;
  account_number: string;
  account_name:   string;
  bank_name:      string;
  bank_code:      string;
  is_default:     boolean;
  created_at:     string;
}

export interface LeadPayClient {
  id:           string;
  workspace_id: string;
  first_name:   string;
  last_name:    string | null;
  company:      string | null;
  email:        string;
  country:      string | null;
  notes:        string | null;
  created_at:   string;
  updated_at:   string;
  // computed
  total_billed_cents?: number;
  invoice_count?:      number;
}

export interface InvoiceLineItem {
  description:      string;
  quantity:         number;
  unit_price_cents: number;
  total_cents:      number;
}

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "paid"
  | "overdue"
  | "cancelled";

export interface LeadPayInvoice {
  id:             string;
  workspace_id:   string;
  client_id:      string | null;
  invoice_number: string;
  status:         InvoiceStatus;

  line_items:     InvoiceLineItem[];
  subtotal_cents: number;
  tax_rate:       number;
  tax_cents:      number;
  total_cents:    number;

  issue_date:   string;
  due_date:     string | null;
  paid_at:      string | null;

  payment_token: string;

  client_email: string | null;
  client_name:  string | null;
  last_sent_at: string | null;
  viewed_at:    string | null;

  fx_rate:            number | null;
  platform_fee_cents: number;
  net_usd_cents:      number;

  notes: string | null;

  created_at: string;
  updated_at: string;

  // joined
  client?: LeadPayClient;
}

export interface LeadPayInvoiceEvent {
  id:         string;
  invoice_id: string;
  event:      "created" | "sent" | "viewed" | "payment_attempted" | "paid" | "reminded" | "cancelled";
  metadata:   Record<string, unknown>;
  created_at: string;
}

export type PayoutStatus = "pending" | "processing" | "completed" | "failed";

export interface LeadPayPayout {
  id:               string;
  workspace_id:     string;
  bank_account_id:  string | null;

  usd_amount_cents: number;
  fx_rate:          number;
  fx_fee_cents:     number;
  ngn_amount_kobo:  number;

  status:           PayoutStatus;
  failure_reason:   string | null;
  provider_ref:     string | null;

  approved_by:      string | null;
  approved_at:      string | null;
  rejection_reason: string | null;

  reference:  string;
  created_at: string;
  updated_at: string;

  // joined
  bank_account?: LeadPayBankAccount;
}

export type CardStatus = "active" | "frozen" | "terminated";

export interface LeadPayCard {
  id:           string;
  workspace_id: string;
  label:        string;

  provider_card_id: string | null;
  last_four:        string | null;
  expiry_month:     string | null;
  expiry_year:      string | null;
  masked_pan:       string | null;

  status:               CardStatus;
  balance_cents:        number;
  monthly_limit_cents:  number | null;
  creation_fee_cents:   number;
  approved_at:          string | null;

  created_at: string;
  updated_at: string;
}

export type CardTxStatus = "approved" | "declined" | "reversed" | "refunded";

export interface LeadPayCardTransaction {
  id:                string;
  card_id:           string;
  workspace_id:      string;
  merchant:          string | null;
  merchant_category: string | null;
  amount_cents:      number;
  currency:          string;
  status:            CardTxStatus;
  decline_reason:    string | null;
  provider_ref:      string | null;
  created_at:        string;
}

export type TransactionType =
  | "invoice_payment"
  | "payout"
  | "card_spend"
  | "card_funding"
  | "fee"
  | "refund"
  | "adjustment";

export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export interface LeadPayTransaction {
  id:           string;
  workspace_id: string;
  type:         TransactionType;

  invoice_id: string | null;
  payout_id:  string | null;
  card_id:    string | null;

  description:      string;
  usd_amount_cents: number | null;
  ngn_amount_kobo:  number | null;
  status:           TransactionStatus;
  reference:        string;
  created_at:       string;
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
export interface LeadPayDashboardStats {
  usd_balance_cents:     number;
  usd_pending_cents:     number;
  received_mtd_cents:    number;
  paid_out_mtd_cents:    number;
  invoices_sent_mtd:     number;
  avg_payment_days:      number | null;
  recent_transactions:   LeadPayTransaction[];
  unpaid_invoices:       LeadPayInvoice[];
}

// ── Fee settings (from admin_settings) ───────────────────────────────────────
export interface LeadPayFeeSettings {
  platform_fee_pct:        number;
  fx_spread_pct:           number;
  min_fee_cents:           number;
  card_creation_fee_cents: number;
  card_monthly_fee_cents:  number;
  min_payout_ngn:          number;
  auto_approve_payout_ngn: number;
  max_invoice_usd:         number;
  card_max_per_user:       number;
  enabled:                 boolean;
}

// ── Public payment page ───────────────────────────────────────────────────────
export interface PublicInvoiceData {
  invoice_number: string;
  status:         InvoiceStatus;
  line_items:     InvoiceLineItem[];
  subtotal_cents: number;
  tax_rate:       number;
  tax_cents:      number;
  total_cents:    number;
  due_date:       string | null;
  notes:          string | null;
  client_name:    string | null;
  // Issuer branding
  display_name:   string | null;
  logo_url:       string | null;
  brand_color:    string;
}
