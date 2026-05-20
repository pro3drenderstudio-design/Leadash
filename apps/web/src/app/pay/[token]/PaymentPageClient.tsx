"use client";

import { useState, useEffect } from "react";
import type { PublicInvoiceData, InvoiceLineItem } from "@/types/leadpay";

interface Props { token: string }

declare global {
  interface Window {
    FlutterwaveCheckout?: (options: Record<string, unknown>) => void;
  }
}

export default function PaymentPageClient({ token }: Props) {
  const [invoice, setInvoice]   = useState<PublicInvoiceData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [paying, setPaying]     = useState(false);
  const [paid, setPaid]         = useState(false);
  const [payerEmail, setPayerEmail] = useState("");
  const [payerName,  setPayerName]  = useState("");

  useEffect(() => {
    fetch(`/api/pay/${token}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d: PublicInvoiceData | null) => {
        if (d) {
          setInvoice(d);
          if (d.status === "paid") setPaid(true);
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Load Flutterwave inline script
  useEffect(() => {
    if (!document.getElementById("fw-script")) {
      const script = document.createElement("script");
      script.id    = "fw-script";
      script.src   = "https://checkout.flutterwave.com/v3.js";
      document.head.appendChild(script);
    }
  }, []);

  async function handlePay() {
    if (!invoice || !payerEmail) return;
    setPaying(true);

    const fw = window.FlutterwaveCheckout;
    if (!fw) {
      alert("Payment system not loaded. Please refresh.");
      setPaying(false);
      return;
    }

    fw({
      public_key: process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY ?? "",
      tx_ref:     `LP-${token}-${Date.now()}`,
      amount:     invoice.total_cents / 100,
      currency:   "USD",
      payment_options: "card",
      customer: {
        email: payerEmail,
        name:  payerName || invoice.client_name || "Client",
      },
      customizations: {
        title:       invoice.display_name ?? "Invoice Payment",
        description: `Invoice ${invoice.invoice_number}`,
        logo:        invoice.logo_url ?? "",
      },
      callback: async (response: { status: string; transaction_id: string; flw_ref: string }) => {
        if (response.status === "successful") {
          await fetch(`/api/pay/${token}/pay`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider_ref: response.flw_ref ?? response.transaction_id,
              payer_email:  payerEmail,
              payer_name:   payerName,
            }),
          });
          setPaid(true);
        }
        setPaying(false);
      },
      onclose: () => setPaying(false),
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invoice Not Found</h1>
          <p className="text-gray-500">This payment link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  if (paid || invoice.status === "paid") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Received!</h1>
          <p className="text-gray-500 mb-1">Invoice {invoice.invoice_number}</p>
          <p className="text-3xl font-bold text-gray-900 mt-4">${(invoice.total_cents / 100).toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-2">Thank you for your payment.</p>
        </div>
      </div>
    );
  }

  if (invoice.status === "cancelled") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-semibold text-gray-900">Invoice Cancelled</h1>
          <p className="text-gray-500 mt-2">This invoice is no longer active.</p>
        </div>
      </div>
    );
  }

  const brandColor = invoice.brand_color ?? "#6366f1";
  const isOverdue  = invoice.due_date && new Date(invoice.due_date) < new Date();

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header / Branding */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="h-2" style={{ background: brandColor }} />
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                {invoice.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={invoice.logo_url} alt="Logo" className="h-8 mb-2 object-contain" />
                )}
                <p className="font-semibold text-gray-900">{invoice.display_name ?? "Invoice"}</p>
                <p className="text-sm text-gray-500 mt-0.5">Invoice {invoice.invoice_number}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900">${(invoice.total_cents / 100).toFixed(2)}</p>
                {invoice.due_date && (
                  <p className={`text-xs mt-1 ${isOverdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
                    {isOverdue ? "Overdue" : "Due"} {new Date(invoice.due_date).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="p-6 space-y-3">
            {(invoice.line_items as InvoiceLineItem[]).map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.quantity} × ${(item.unit_price_cents / 100).toFixed(2)}
                  </p>
                </div>
                <p className="text-sm font-medium text-gray-900 shrink-0">
                  ${(item.total_cents / 100).toFixed(2)}
                </p>
              </div>
            ))}

            <div className="border-t border-gray-100 pt-3 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>${(invoice.subtotal_cents / 100).toFixed(2)}</span>
              </div>
              {invoice.tax_rate > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Tax ({invoice.tax_rate}%)</span>
                  <span>${(invoice.tax_cents / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-gray-900 pt-1">
                <span>Total</span>
                <span>${(invoice.total_cents / 100).toFixed(2)}</span>
              </div>
            </div>

            {invoice.notes && (
              <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">{invoice.notes}</p>
            )}
          </div>
        </div>

        {/* Payment form */}
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Pay with Card</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Your Name</label>
            <input
              type="text"
              value={payerName}
              onChange={e => setPayerName(e.target.value)}
              placeholder={invoice.client_name ?? "Full name"}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Email Address <span className="text-red-400">*</span></label>
            <input
              type="email"
              value={payerEmail}
              onChange={e => setPayerEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-400"
            />
          </div>

          <button
            onClick={handlePay}
            disabled={paying || !payerEmail}
            style={{ background: brandColor }}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {paying ? "Opening payment…" : `Pay $${(invoice.total_cents / 100).toFixed(2)}`}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Payments are processed securely. Your card details are never stored.
          </p>
        </div>
      </div>
    </div>
  );
}
