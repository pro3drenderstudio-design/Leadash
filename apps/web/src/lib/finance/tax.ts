/**
 * Finance ledger taxonomy + Nigerian tax engine.
 *
 * Ported from mizark-partners/lib/financials.ts, adapted for Leadash as a
 * single business (no division dimension). Revenue categories mirror the
 * income types the 075 sync already uses (finance_map_billing_type), so
 * auto-fed ledger rows and manual entries share one vocabulary.
 *
 * All tax figures are ESTIMATES for planning until Leadash Global Limited
 * completes CAC/FIRS registration — see TAX_DISCLAIMER and the
 * finance_settings.vat_registered flag.
 */

export const TYPES = {
  revenue: "Revenue",
  cogs: "Cost of Sales",
  opex: "Operating Expenses",
  tax: "Tax & Compliance",
  equity: "Capital & Equity",
} as const;

export type TxType = keyof typeof TYPES;

export const CATEGORIES: Record<TxType, Record<string, string>> = {
  revenue: {
    "revenue.plan":      "Plan Subscriptions",
    "revenue.credits":   "Lead Credits",
    "revenue.academy":   "Academy Sales",
    "revenue.challenge": "Challenge Sales",
    "revenue.offer":     "Offer Purchases",
    "revenue.addon":     "Add-ons (Inboxes, IPs, Domains)",
    "revenue.external":  "External / Consulting",
    "revenue.other":     "Other Revenue",
  },
  cogs: {
    "cogs.payment_fees":     "Payment Processing Fees",
    "cogs.infrastructure":   "Cloud Infrastructure",
    "cogs.third_party_apis": "Third-party APIs",
    "cogs.ad_spend":         "Ad Spend",
    "cogs.affiliate":        "Affiliate / Influencer",
    "cogs.platform_fees":    "Platform Fees",
    "cogs.other":            "Other COGS",
  },
  opex: {
    "opex.salary":       "Salaries & Wages",
    "opex.contractor":   "Contractor Payments",
    "opex.rent":         "Rent / Office",
    "opex.legal":        "Legal & Compliance",
    "opex.accounting":   "Accounting & Audit",
    "opex.tools":        "Software & Tools",
    "opex.bank_charges": "Bank Charges",
    "opex.other":        "Other Expenses",
  },
  tax: {
    "tax.cit":        "Company Income Tax (CIT)",
    "tax.education":  "Education Tax (2%)",
    "tax.vat_output": "VAT Output (collected)",
    "tax.vat_input":  "VAT Input (claimable)",
    "tax.wht":        "Withholding Tax",
    "tax.paye":       "PAYE",
  },
  equity: {
    "equity.investment":      "Principal Investment",
    "equity.loan_in":         "Shareholder Loan Received",
    "equity.loan_repayment":  "Loan Repayment",
    "equity.distribution":    "Profit Distribution",
    "equity.owner_draw":      "Owner Withdrawal",
  },
};

/** Cash direction per category — used for bank-account balance math (Phase
 *  9). Revenue and capital coming IN are +1; every outflow (costs, tax paid,
 *  distributions, loan repayments) is -1. Unlisted categories default to the
 *  sign implied by their type (revenue/equity=+1, cogs/opex/tax=-1) via
 *  `cashSign()` below — this map only needs to hold the equity exceptions. */
const EQUITY_CASH_SIGN: Record<string, 1 | -1> = {
  "equity.investment":     1,
  "equity.loan_in":        1,
  "equity.loan_repayment": -1,
  "equity.distribution":   -1,
  "equity.owner_draw":     -1,
};

export function cashSign(type: TxType, category: string): 1 | -1 {
  if (type === "equity") return EQUITY_CASH_SIGN[category] ?? 1;
  return type === "revenue" ? 1 : -1;
}

export const TAX_DISCLAIMER =
  "Estimates for planning only — Leadash Global Limited is not yet FIRS/VAT registered. " +
  "Confirm all figures with your accountant before filing or remitting anything.";

export interface FinanceTransaction {
  id: string;
  date: string;          // ISO date e.g. "2026-07-01"
  type: TxType;
  category: string;      // e.g. "revenue.plan"
  amount_ngn: number;    // always positive; type determines sign in P&L
  principal_id: string | null;
  bank_account_id: string | null;
  description: string | null;
  reference: string | null;
  is_auto: boolean;
  source_type: string | null;
  source_id: string | null;
  kind: string | null;   // 'gross' | 'fee' on auto rows
  review_status: "unreviewed" | "reviewed" | "flagged";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  adjusts_id: string | null;
  created_at: string;
}

export type CategoryLine = Record<string, number>;

export interface PeriodSummary {
  revenue: CategoryLine;
  cogs: CategoryLine;
  opex: CategoryLine;
  tax: CategoryLine;
  equity: CategoryLine;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  total_opex: number;
  ebitda: number;
  tax_cit: number;
  tax_education: number;
  tax_wht: number;
  tax_paye: number;
  vat_output: number;
  vat_input: number;
  vat_net: number;           // vat_output - vat_input (liability)
  total_tax_expense: number; // cit + education + wht + paye (not VAT — pass-through)
  net_profit: number;        // ebitda - total_tax_expense
  // Capital movements — informational only, never part of P&L/tax above.
  total_equity_in: number;
  total_equity_out: number;
  net_equity: number;
  transaction_count: number;
}

function emptySummary(): PeriodSummary {
  return {
    revenue: {}, cogs: {}, opex: {}, tax: {}, equity: {},
    total_revenue: 0, total_cogs: 0, gross_profit: 0, gross_margin_pct: 0,
    total_opex: 0, ebitda: 0,
    tax_cit: 0, tax_education: 0, tax_wht: 0, tax_paye: 0,
    vat_output: 0, vat_input: 0, vat_net: 0,
    total_tax_expense: 0, net_profit: 0,
    total_equity_in: 0, total_equity_out: 0, net_equity: 0,
    transaction_count: 0,
  };
}

export function computePeriodSummary(transactions: Pick<FinanceTransaction, "type" | "category" | "amount_ngn">[]): PeriodSummary {
  const s = emptySummary();

  for (const tx of transactions) {
    const bucket = s[tx.type] as CategoryLine;
    bucket[tx.category] = (bucket[tx.category] ?? 0) + tx.amount_ngn;
  }

  for (const [category, amount] of Object.entries(s.equity)) {
    if (cashSign("equity", category) > 0) s.total_equity_in += amount;
    else s.total_equity_out += amount;
  }
  s.net_equity = s.total_equity_in - s.total_equity_out;

  s.total_revenue = Object.values(s.revenue).reduce((a, b) => a + b, 0);
  s.total_cogs = Object.values(s.cogs).reduce((a, b) => a + b, 0);
  s.gross_profit = s.total_revenue - s.total_cogs;
  s.gross_margin_pct = s.total_revenue > 0 ? (s.gross_profit / s.total_revenue) * 100 : 0;
  s.total_opex = Object.values(s.opex).reduce((a, b) => a + b, 0);
  s.ebitda = s.gross_profit - s.total_opex;
  s.tax_cit = s.tax["tax.cit"] ?? 0;
  s.tax_education = s.tax["tax.education"] ?? 0;
  s.tax_wht = s.tax["tax.wht"] ?? 0;
  s.tax_paye = s.tax["tax.paye"] ?? 0;
  s.vat_output = s.tax["tax.vat_output"] ?? 0;
  s.vat_input = s.tax["tax.vat_input"] ?? 0;
  s.vat_net = s.vat_output - s.vat_input;
  s.total_tax_expense = s.tax_cit + s.tax_education + s.tax_wht + s.tax_paye;
  s.net_profit = s.ebitda - s.total_tax_expense;
  s.transaction_count = transactions.length;

  return s;
}

// ── Nigerian tax estimators (planning advisory) ─────────────────────────────

/** VAT registration becomes compulsory at this annual turnover. */
export const VAT_REGISTRATION_THRESHOLD_NGN = 25_000_000;

/** CIT: 0% below ₦25M annual revenue (small company), 20% below ₦100M, 30% above — applied to profit. */
export function estimateCIT(annualisedEbitda: number, annualisedRevenue: number): number {
  if (annualisedRevenue < 25_000_000) return 0;
  const rate = annualisedRevenue < 100_000_000 ? 0.20 : 0.30;
  return Math.max(0, annualisedEbitda) * rate;
}

/** Education tax: 2% of assessable profit. */
export function estimateEducationTax(annualisedEbitda: number): number {
  return Math.max(0, annualisedEbitda) * 0.02;
}

/** VAT output at the standard 7.5% rate on revenue. */
export function estimateVATOutput(revenue: number): number {
  return revenue * 0.075;
}
