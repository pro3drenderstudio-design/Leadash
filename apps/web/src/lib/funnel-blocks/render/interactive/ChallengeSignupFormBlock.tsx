"use client";
import { useState, useEffect } from "react";
import { Block } from "../../types";

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: {
        key: string; email: string; amount: number; currency: string;
        metadata?: Record<string, string>;
        callback: (resp: { reference: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
    fbq?: (...args: unknown[]) => void;
  }
}

type PayMethod = "bank" | "paystack";

interface FS {
  fullName: string; email: string; phone: string;
  bankName: string; password: string; method: PayMethod;
}

export function ChallengeSignupFormBlock({ block }: { block: Block }) {
  const p             = block.props;
  const opayAccount   = (p.opay_account as string)  || "9021060638";
  const opayName      = (p.opay_name   as string)   || "Vescrow Solutions";
  const amountNgn     = (p.amount_ngn  as number)   || 10_000;
  const waNumber      = (p.wa_number   as string)   || "2349110260332";
  const ac            = (p.accent_color as string)  || "#f97316";
  const bg            = (p.bg_color    as string)   || "#f9fafb";
  const heading       = (p.heading     as string)   || "Join the 7-Day Challenge";
  const sub           = (p.subtext     as string)   || `₦${amountNgn.toLocaleString()} one-time · Lifetime access to community`;
  const confirmNote   = (p.confirmation_note as string) || "Our community manager confirms within 2 hours and adds you to the WhatsApp group.";
  const showPaystack  = p.show_paystack !== false;
  const pk            = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "") : "";

  const [form,    setForm]    = useState<FS>({ fullName:"", email:"", phone:"", bankName:"", password:"", method:"bank" });
  const [loading, setLoad]    = useState(false);
  const [error,   setError]   = useState("");
  const [copied,  setCopied]  = useState(false);
  const [psReady, setPsReady] = useState(false);
  const [success, setSuccess] = useState<{ wa_url: string } | null>(null);

  useEffect(() => {
    if (!showPaystack) return;
    if (document.querySelector('script[src*="paystack"]')) { setPsReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload = () => setPsReady(true);
    document.head.appendChild(s);
  }, [showPaystack]);

  const set = (k: keyof FS) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  function copyAccount() {
    navigator.clipboard.writeText(opayAccount).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submit(method: PayMethod, paystackRef?: string) {
    setLoad(true); setError("");
    try {
      const res = await fetch("/api/challenge/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.fullName, email: form.email, phone: form.phone,
          bank_account_name: method === "bank" ? form.bankName : form.fullName,
          password: form.password, payment_method: method,
          paystack_reference: paystackRef ?? null,
        }),
      });
      const d = await res.json() as { ok?: boolean; wa_url?: string; error?: string };
      if (!res.ok) { setError(d.error ?? "Something went wrong."); return; }
      if (typeof window.fbq === "function") window.fbq("track", "Lead", { value: amountNgn, currency: "NGN" });
      setSuccess({ wa_url: d.wa_url! });
    } catch { setError("Network error — please try again."); }
    finally { setLoad(false); }
  }

  function handleBank(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bankName.trim()) { setError("Enter the exact name you used for the bank transfer."); return; }
    void submit("bank");
  }

  function handlePaystack() {
    if (!psReady || !window.PaystackPop) { setError("Paystack is still loading — wait a moment."); return; }
    if (!form.email || !form.fullName || !form.phone || !form.password) {
      setError("Fill in all fields above before paying with Paystack."); return;
    }
    window.PaystackPop.setup({
      key: pk, email: form.email, amount: amountNgn * 100, currency: "NGN",
      metadata: { full_name: form.fullName, phone: form.phone },
      callback: (resp) => void submit("paystack", resp.reference),
      onClose: () => setError("Payment window closed. Try again when ready."),
    }).openIframe();
  }

  const inp: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db",
    borderRadius: 8, padding: "11px 13px", fontSize: 14, color: "#111827",
    background: "#f9fafb", fontFamily: "inherit", outline: "none",
  };
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 };

  if (success) return (
    <div style={{ background: bg, padding: "56px 24px" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "40px 32px", textAlign: "center", maxWidth: 440, margin: "0 auto", border: "1px solid #e5e7eb" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" fill="none" stroke="#16a34a" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 8 }}>You&apos;re registered!</h3>
        <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          Message our community manager on WhatsApp to confirm your payment and get added to the group.
          We also sent your login details by email.
        </p>
        <a href={success.wa_url} target="_blank" rel="noreferrer"
          style={{ display: "block", background: "#25d366", color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px 28px", borderRadius: 10, textDecoration: "none", marginBottom: 12 }}>
          💬 Message Us on WhatsApp
        </a>
        <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer"
          style={{ display: "block", color: "#9ca3af", fontSize: 11, textDecoration: "none" }}>
          We confirm and add you to the group within 2 hours during business hours.
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ background: bg, padding: "56px 24px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {Boolean(p.section_label) && (
          <p style={{ textAlign: "center", fontSize: 13, color: ac, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            {p.section_label as string}
          </p>
        )}
        {Boolean(p.section_heading) && (
          <h2 style={{ textAlign: "center", fontSize: "clamp(22px,4vw,32px)", fontWeight: 800, color: "#111827", marginBottom: 6 }}>
            {p.section_heading as string}
          </h2>
        )}
        {Boolean(p.section_subtext) && (
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, marginBottom: 28 }}>
            {p.section_subtext as string}
          </p>
        )}
        <div style={{ background: "#fff", borderRadius: 16, padding: "36px 32px", border: "1px solid #e5e7eb", boxShadow: "0 20px 60px -20px rgba(0,0,0,0.12)" }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: "#111827", textAlign: "center", marginBottom: 4 }}>{heading}</h3>
          <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", marginBottom: 24 }}>{sub}</p>

          {/* Common fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {([
              { k: "fullName" as const, label: "Full Name",                     type: "text",     ph: "e.g. Adaora Okonkwo"     },
              { k: "email"    as const, label: "Email Address",                 type: "email",    ph: "you@gmail.com"            },
              { k: "phone"    as const, label: "WhatsApp Number",               type: "tel",      ph: "+234 801 234 5678"        },
              { k: "password" as const, label: "Password (for your account)",   type: "password", ph: "Min. 8 characters"        },
            ] as Array<{ k: keyof FS; label: string; type: string; ph: string }>).map(({ k, label, type, ph }) => (
              <div key={k}>
                <label style={lbl}>{label}</label>
                <input type={type} value={form[k]} onChange={set(k)} placeholder={ph} required style={inp} />
              </div>
            ))}
          </div>

          {/* Payment method toggle */}
          {showPaystack && (
            <div style={{ marginBottom: 20 }}>
              <label style={lbl}>Payment Method</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(["bank", "paystack"] as PayMethod[]).map(m => (
                  <button key={m} type="button" onClick={() => setForm(prev => ({ ...prev, method: m }))}
                    style={{
                      padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                      border: form.method === m ? `2px solid ${ac}` : "1px solid #d1d5db",
                      background: form.method === m ? "#fff7ed" : "#f9fafb",
                      color: form.method === m ? "#c2410c" : "#6b7280", fontFamily: "inherit",
                    }}>
                    {m === "bank" ? "🏦 Bank Transfer" : "💳 Pay Online"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bank transfer */}
          {form.method === "bank" && (
            <form onSubmit={handleBank}>
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 10 }}>
                  Transfer ₦{amountNgn.toLocaleString()} to:
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderRadius: 7, padding: "10px 13px", border: "1px solid #fcd34d" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#111827", letterSpacing: ".02em" }}>{opayAccount}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>OPay · {opayName}</div>
                  </div>
                  <button type="button" onClick={copyAccount}
                    style={{ background: copied ? "#dcfce7" : "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", color: copied ? "#16a34a" : "#374151", fontWeight: 500, fontFamily: "inherit" }}>
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "#78350f", marginTop: 8 }}>
                  After transferring, enter the <strong>account name you used</strong> below and submit.
                </p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Your Transfer Account Name</label>
                <input type="text" value={form.bankName} onChange={set("bankName")} placeholder="Exact name on your bank account" required style={inp} />
              </div>
              {error && <p style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>{error}</p>}
              <button type="submit" disabled={loading}
                style={{ width: "100%", background: loading ? "#9ca3af" : ac, color: "#fff", fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 10, border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: `0 8px 20px -8px ${ac}80`, fontFamily: "inherit" }}>
                {loading ? "Registering..." : "I've Paid — Register Me →"}
              </button>
              <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, marginTop: 10 }}>{confirmNote}</p>
            </form>
          )}

          {/* Paystack */}
          {form.method === "paystack" && (
            <div>
              {error && <p style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>{error}</p>}
              <button type="button" onClick={handlePaystack} disabled={loading || !psReady}
                style={{ width: "100%", background: loading ? "#9ca3af" : "#0ba4db", color: "#fff", fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 10, border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 8px 20px -8px rgba(11,164,219,.5)", fontFamily: "inherit" }}>
                {loading ? "Processing..." : !psReady ? "Loading payment..." : `Pay ₦${amountNgn.toLocaleString()} Online →`}
              </button>
              <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, marginTop: 10 }}>
                Card, bank transfer, USSD, mobile money — all accepted. Instant confirmation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
