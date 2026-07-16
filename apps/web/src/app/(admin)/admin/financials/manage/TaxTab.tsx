"use client";
/**
 * Tax tab — P&L rollup from the categorized ledger plus Nigerian tax
 * estimates (VAT 7.5%, CIT bands, Education tax 2%). Everything is labeled
 * ESTIMATE while finance_settings.vat_registered is false (Leadash Global
 * Limited pre-registration); the toggle flips labels to liability tracking.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TYPES, CATEGORIES, type TxType, type FinanceTransaction,
  computePeriodSummary, estimateCIT, estimateEducationTax, estimateVATOutput,
  VAT_REGISTRATION_THRESHOLD_NGN, TAX_DISCLAIMER,
} from "@/lib/finance/tax";
import { FIN_TH, FIN_TD, FIN_CARD, FIN_LABEL, FIN_GHOST_BTN, ngnFull, monthBounds, currentMonth } from "./finStyles";
import { useConfirmDialog } from "./ConfirmDialog";

interface TaxSettings {
  vat_registered: boolean;
  vat_pricing_mode: "inclusive" | "exclusive";
  firs_tin: string | null;
}

export default function TaxTab() {
  const [month, setMonth] = useState<string>(currentMonth());
  const [txs, setTxs] = useState<FinanceTransaction[]>([]);
  const [yearTxs, setYearTxs] = useState<FinanceTransaction[]>([]);
  const [settings, setSettings] = useState<TaxSettings>({ vat_registered: false, vat_pricing_mode: "inclusive", firs_tin: null });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = monthBounds(month);
    const year = month.slice(0, 4);
    const [txRes, yearRes, settingsRes] = await Promise.all([
      fetch(`/api/admin/finance/transactions?start=${start}&end=${end}&limit=2000`).then(r => r.json()),
      fetch(`/api/admin/finance/transactions?start=${year}-01-01&end=${year}-12-31&limit=2000`).then(r => r.json()),
      fetch("/api/admin/finance/settings").then(r => r.json()),
    ]);
    setTxs(txRes.transactions ?? []);
    setYearTxs(yearRes.transactions ?? []);
    if (settingsRes.settings) {
      setSettings({
        vat_registered:   Boolean(settingsRes.settings.vat_registered),
        vat_pricing_mode: settingsRes.settings.vat_pricing_mode ?? "inclusive",
        firs_tin:         settingsRes.settings.firs_tin ?? null,
      });
    }
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => computePeriodSummary(txs), [txs]);
  const ytd = useMemo(() => computePeriodSummary(yearTxs), [yearTxs]);

  // Annualize from YTD (months elapsed in the selected year)
  const monthsElapsed = useMemo(() => {
    const year = Number(month.slice(0, 4));
    const now = new Date();
    if (year < now.getFullYear()) return 12;
    return Math.max(1, now.getMonth() + 1);
  }, [month]);
  const annRevenue = (ytd.total_revenue / monthsElapsed) * 12;
  const annEbitda  = (ytd.ebitda / monthsElapsed) * 12;
  const citEstimate = estimateCIT(annEbitda, annRevenue);
  const eduEstimate = estimateEducationTax(annEbitda);
  const vatEstimate = estimateVATOutput(summary.total_revenue);
  const thresholdPct = Math.min(100, (annRevenue / VAT_REGISTRATION_THRESHOLD_NGN) * 100);
  const estimateMode = !settings.vat_registered;

  async function saveSettings(patch: Partial<TaxSettings>) {
    setSavingSettings(true);
    const next = { ...settings, ...patch };
    setSettings(next);
    await fetch("/api/admin/finance/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSavingSettings(false);
  }

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const d = new Date();
    for (let i = 0; i < 18; i++) { opts.push(d.toISOString().slice(0, 7)); d.setMonth(d.getMonth() - 1); }
    return opts;
  }, []);

  function plRows(type: TxType) {
    return Object.entries(summary[type]).filter(([, v]) => v !== 0).map(([cat, v]) => ({
      cat, label: CATEGORIES[type]?.[cat] ?? cat, value: v,
    }));
  }

  const rowStyle = { borderBottom: "1px solid var(--app-border)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Estimate banner */}
      {estimateMode && (
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 16px", borderRadius: 12,
          border: "1px solid var(--app-warning)", background: "var(--app-warning-soft)", fontSize: 12.5,
        }}>
          <span style={{ fontWeight: 700, color: "var(--app-warning)", whiteSpace: "nowrap" }}>ESTIMATES ONLY</span>
          <span style={{ color: "var(--app-text-muted)" }}>{TAX_DISCLAIMER}</span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select className="fin-input" style={{ width: "auto" }} value={month} onChange={e => setMonth(e.target.value)}>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--app-text-muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.vat_registered}
            disabled={savingSettings}
            onChange={async e => {
              const checked = e.target.checked;
              if (checked) {
                const ok = await confirm({
                  title: "Mark FIRS/VAT registered?",
                  body: "Tax panels switch from estimates to liability tracking.",
                  confirmLabel: "Confirm registration",
                });
                if (!ok) return;
              }
              saveSettings({ vat_registered: checked });
            }}
          />
          FIRS/VAT registered
        </label>
        <input
          className="fin-input" style={{ width: 160 }} placeholder="FIRS TIN (optional)"
          defaultValue={settings.firs_tin ?? ""}
          onBlur={e => { if (e.target.value !== (settings.firs_tin ?? "")) saveSettings({ firs_tin: e.target.value || null }); }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--app-text-quiet)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* P&L */}
          <div style={FIN_CARD}>
            <div style={{ overflowX: "auto" }}>
              <table className="fin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr><th style={FIN_TH}>Line item ({month})</th><th style={{ ...FIN_TH, textAlign: "right" }}>Amount</th></tr>
                </thead>
                <tbody>
                  {(["revenue", "cogs"] as TxType[]).map(type => (
                    plRows(type).length > 0 && (
                      <>
                        <tr key={`${type}-h`} style={rowStyle}><td colSpan={2} style={{ ...FIN_TD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--app-text-quiet)", background: "var(--app-surface-strong)" }}>{TYPES[type]}</td></tr>
                        {plRows(type).map(r => (
                          <tr key={r.cat} style={rowStyle}>
                            <td style={{ ...FIN_TD, paddingLeft: 28, color: "var(--app-text-muted)" }}>{r.label}</td>
                            <td style={{ ...FIN_TD, textAlign: "right" }}>{ngnFull(r.value)}</td>
                          </tr>
                        ))}
                      </>
                    )
                  ))}
                  <tr style={rowStyle}>
                    <td style={{ ...FIN_TD, fontWeight: 700 }}>Gross profit</td>
                    <td style={{ ...FIN_TD, textAlign: "right", fontWeight: 700, color: summary.gross_profit >= 0 ? "var(--app-in, #6EE7B7)" : "var(--app-out)" }}>
                      {ngnFull(summary.gross_profit)}
                      {summary.total_revenue > 0 && <span style={{ fontWeight: 400, color: "var(--app-text-quiet)", marginLeft: 8, fontSize: 11 }}>{summary.gross_margin_pct.toFixed(1)}%</span>}
                    </td>
                  </tr>
                  {plRows("opex").length > 0 && (
                    <>
                      <tr style={rowStyle}><td colSpan={2} style={{ ...FIN_TD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--app-text-quiet)", background: "var(--app-surface-strong)" }}>{TYPES.opex}</td></tr>
                      {plRows("opex").map(r => (
                        <tr key={r.cat} style={rowStyle}>
                          <td style={{ ...FIN_TD, paddingLeft: 28, color: "var(--app-text-muted)" }}>{r.label}</td>
                          <td style={{ ...FIN_TD, textAlign: "right" }}>{ngnFull(r.value)}</td>
                        </tr>
                      ))}
                    </>
                  )}
                  <tr style={rowStyle}>
                    <td style={{ ...FIN_TD, fontWeight: 700 }}>EBITDA</td>
                    <td style={{ ...FIN_TD, textAlign: "right", fontWeight: 700 }}>{ngnFull(summary.ebitda)}</td>
                  </tr>
                  {plRows("tax").length > 0 && (
                    <>
                      <tr style={rowStyle}><td colSpan={2} style={{ ...FIN_TD, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--app-text-quiet)", background: "var(--app-surface-strong)" }}>Tax (recorded)</td></tr>
                      {plRows("tax").map(r => (
                        <tr key={r.cat} style={rowStyle}>
                          <td style={{ ...FIN_TD, paddingLeft: 28, color: "var(--app-text-muted)" }}>{r.label}</td>
                          <td style={{ ...FIN_TD, textAlign: "right" }}>{ngnFull(r.value)}</td>
                        </tr>
                      ))}
                    </>
                  )}
                  <tr>
                    <td style={{ ...FIN_TD, fontWeight: 700 }}>Net profit</td>
                    <td style={{ ...FIN_TD, textAlign: "right", fontWeight: 700, color: summary.net_profit >= 0 ? "var(--app-in, #6EE7B7)" : "var(--app-out)" }}>{ngnFull(summary.net_profit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ padding: "10px 16px", margin: 0, fontSize: 11, color: "var(--app-text-quiet)", borderTop: "1px solid var(--app-border)" }}>
              VAT is excluded from net profit (pass-through). Payment processing fees are auto-recorded from Paystack per transaction.
            </p>
          </div>

          {/* Tax panels */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {/* VAT */}
            <div style={{ ...FIN_CARD, padding: 18 }}>
              <p style={FIN_LABEL}>VAT — 7.5% {estimateMode && <span style={{ color: "var(--app-warning)" }}>· estimate</span>}</p>
              {[
                { label: estimateMode ? "VAT you WOULD have collected this month" : "Output VAT recorded", value: estimateMode ? vatEstimate : summary.vat_output },
                { label: "Input VAT recorded (claimable)", value: summary.vat_input },
                { label: estimateMode ? "Would-be net liability" : "Net VAT liability (remit to FIRS)", value: estimateMode ? vatEstimate - summary.vat_input : summary.vat_net },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--app-border)", fontSize: 12.5 }}>
                  <span style={{ color: "var(--app-text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{ngnFull(value)}</span>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 11, color: "var(--app-text-quiet)", margin: "0 0 6px" }}>
                  VAT registration threshold — annualized revenue {ngnFull(annRevenue)} of ₦25,000,000
                </p>
                <div style={{ height: 6, borderRadius: 3, background: "var(--app-surface-strong)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${thresholdPct}%`, background: thresholdPct >= 80 ? "var(--app-warning)" : "var(--app-accent)", borderRadius: 3 }} />
                </div>
                {thresholdPct >= 80 && (
                  <p style={{ fontSize: 11, color: "var(--app-warning)", margin: "6px 0 0" }}>
                    Approaching the compulsory VAT registration threshold — talk to your accountant about registering.
                  </p>
                )}
              </div>
            </div>

            {/* CIT */}
            <div style={{ ...FIN_CARD, padding: 18 }}>
              <p style={FIN_LABEL}>Company income tax {estimateMode && <span style={{ color: "var(--app-warning)" }}>· estimate</span>}</p>
              {[
                ["Annualized revenue", ngnFull(annRevenue)],
                ["Annualized EBITDA", ngnFull(annEbitda)],
                ["CIT band", annRevenue < 25_000_000 ? "0% (small company)" : annRevenue < 100_000_000 ? "20%" : "30%"],
                ["Estimated CIT / year", ngnFull(citEstimate)],
                ["Education tax (2%) / year", ngnFull(eduEstimate)],
                ["Total est. income tax / year", ngnFull(citEstimate + eduEstimate)],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--app-border)", fontSize: 12.5 }}>
                  <span style={{ color: "var(--app-text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: "var(--app-text-quiet)", margin: "10px 0 0" }}>
                &lt;₦25M revenue: CIT-exempt. ₦25M–₦100M: 20%. &gt;₦100M: 30%. Filed annually — set the estimate aside monthly so it never surprises you.
              </p>
            </div>

            {/* WHT / PAYE */}
            <div style={{ ...FIN_CARD, padding: 18 }}>
              <p style={FIN_LABEL}>WHT &amp; PAYE (recorded)</p>
              {[
                { label: "Withholding tax (contractors, services)", value: summary.tax_wht },
                { label: "PAYE (employee income tax)", value: summary.tax_paye },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--app-border)", fontSize: 12.5 }}>
                  <span style={{ color: "var(--app-text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{ngnFull(value)}</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: "var(--app-text-quiet)", margin: "10px 0 0" }}>
                Record WHT/PAYE as tax entries in the Ledger when you start withholding — they roll up here automatically.
              </p>
              <button onClick={load} style={{ ...FIN_GHOST_BTN, marginTop: 10 }}>Refresh</button>
            </div>
          </div>
        </>
      )}
      {dialog}
    </div>
  );
}
