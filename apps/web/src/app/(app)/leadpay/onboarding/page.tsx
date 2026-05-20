"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { wsFetch } from "@/lib/workspace/client";

const PROFESSIONS = ["Freelancer","Designer","Developer","Consultant","Copywriter","Photographer","Videographer","Marketer","Other"];
const BUSINESS_TYPES = ["Agency","Studio","Consultancy","Tech Company","Creative Services","Other"];
const NIGERIAN_BANKS = [
  { name: "Access Bank",        code: "044" },
  { name: "Citibank Nigeria",   code: "023" },
  { name: "EcoBank Nigeria",    code: "050" },
  { name: "Fidelity Bank",      code: "070" },
  { name: "First Bank Nigeria", code: "011" },
  { name: "First City Monument Bank", code: "214" },
  { name: "Globus Bank",        code: "00103" },
  { name: "Guarantee Trust Bank", code: "058" },
  { name: "Heritage Bank",      code: "030" },
  { name: "Keystone Bank",      code: "082" },
  { name: "Kuda Bank",          code: "50211" },
  { name: "OPay",               code: "999992" },
  { name: "Palmpay",            code: "999991" },
  { name: "Polaris Bank",       code: "076" },
  { name: "Providus Bank",      code: "101" },
  { name: "Stanbic IBTC Bank",  code: "221" },
  { name: "Standard Chartered", code: "068" },
  { name: "Sterling Bank",      code: "232" },
  { name: "Titan Trust Bank",   code: "102" },
  { name: "Union Bank",         code: "032" },
  { name: "United Bank for Africa", code: "033" },
  { name: "Unity Bank",         code: "215" },
  { name: "Wema Bank",          code: "035" },
  { name: "Zenith Bank",        code: "057" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]       = useState(1);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Step 1 — Personal
  const [accountType, setAccountType] = useState<"individual" | "business">("individual");
  const [firstName, setFirstName]     = useState("");
  const [lastName, setLastName]       = useState("");
  const [dob, setDob]                 = useState("");
  const [phone, setPhone]             = useState("");
  const [profession, setProfession]   = useState("");

  // Step 2 — Business (only if business)
  const [bizName, setBizName]   = useState("");
  const [rcNumber, setRcNumber] = useState("");
  const [bizType, setBizType]   = useState("");
  const [website, setWebsite]   = useState("");

  // Step 3 — Identity
  const [idType, setIdType] = useState<"bvn" | "nin">("bvn");
  const [idValue, setIdValue] = useState("");

  // Step 4 — Bank
  const [bankCode, setBankCode]         = useState("");
  const [bankName, setBankName]         = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName]   = useState("");
  const [resolving, setResolving]       = useState(false);

  const totalSteps = accountType === "business" ? 4 : 3;
  const progress = Math.round((step / totalSteps) * 100);

  async function resolveAccount() {
    if (accountNumber.length !== 10 || !bankCode) return;
    setResolving(true);
    try {
      const res = await wsFetch("/api/leadpay/bank-accounts/resolve", {
        method: "POST",
        body: JSON.stringify({ account_number: accountNumber, bank_code: bankCode }),
      });
      const data = await res.json() as { account_name?: string; error?: string };
      if (data.account_name) setAccountName(data.account_name);
    } catch { /* ignore */ } finally {
      setResolving(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const res = await wsFetch("/api/leadpay/account", {
        method: "POST",
        body: JSON.stringify({
          account_type: accountType,
          legal_first_name: firstName,
          legal_last_name: lastName,
          date_of_birth: dob,
          phone,
          profession,
          business_name: bizName || null,
          rc_number: rcNumber || null,
          business_type: bizType || null,
          website: website || null,
          id_type: idType,
          bvn_or_nin: idValue,
          bank_account_number: accountNumber,
          account_name: accountName,
          bank_name: bankName,
          bank_code: bankCode,
        }),
      });
      if (!res.ok) {
        const d = await res.json() as { error: string };
        setError(d.error ?? "Something went wrong");
        return;
      }
      router.push("/leadpay");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const stepLabels = accountType === "business"
    ? ["Personal", "Business", "Identity", "Bank Account"]
    : ["Personal", "Identity", "Bank Account"];

  // ── Step content ──────────────────────────────────────────────────────────
  const actualStep = accountType === "business" ? step : step === 2 ? 3 : step === 3 ? 4 : step;

  function canNext() {
    if (step === 1) return firstName.trim() && lastName.trim() && dob && phone;
    if (step === 2 && accountType === "business") return bizName.trim();
    const idStep = accountType === "business" ? 3 : 2;
    if (step === idStep) return idValue.length >= 10;
    const bankStep = accountType === "business" ? 4 : 3;
    if (step === bankStep) return accountNumber.length === 10 && bankCode && accountName;
    return true;
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">Set up Leadash Pay</h1>
          <span className="text-xs text-white/30">{step} of {totalSteps}</span>
        </div>
        <div className="h-1 bg-white/8 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex gap-4 mt-3">
          {stepLabels.map((l, i) => (
            <span key={l} className={`text-[11px] ${i + 1 === step ? "text-orange-400 font-semibold" : i + 1 < step ? "text-white/50" : "text-white/20"}`}>{l}</span>
          ))}
        </div>
      </div>

      <div className="bg-white/4 border border-white/8 rounded-2xl p-6">
        {/* Step 1: Personal */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-white mb-3">Account type</p>
              <div className="grid grid-cols-2 gap-3">
                {(["individual","business"] as const).map(t => (
                  <button key={t} onClick={() => setAccountType(t)}
                    className={`py-2.5 px-4 rounded-xl border text-sm font-medium capitalize transition-all ${accountType === t ? "border-orange-500/60 bg-orange-500/10 text-orange-300" : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">First name</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Last name</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Date of birth</label>
              <input type="date" value={dob} onChange={e => setDob(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Phone number</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
            </div>
            {accountType === "individual" && (
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Profession</label>
                <select value={profession} onChange={e => setProfession(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50">
                  <option value="">Select profession</option>
                  {PROFESSIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Business (only if business) */}
        {step === 2 && accountType === "business" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Business name</label>
              <input value={bizName} onChange={e => setBizName(e.target.value)} placeholder="Acme Design Studio"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Business type</label>
              <select value={bizType} onChange={e => setBizType(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50">
                <option value="">Select type</option>
                {BUSINESS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">RC Number <span className="text-white/20">(optional)</span></label>
              <input value={rcNumber} onChange={e => setRcNumber(e.target.value)} placeholder="RC 1234567"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Website <span className="text-white/20">(optional)</span></label>
              <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourbusiness.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50" />
            </div>
          </div>
        )}

        {/* Identity step */}
        {((step === 2 && accountType === "individual") || (step === 3 && accountType === "business")) && (
          <div className="space-y-4">
            <p className="text-xs text-white/40 leading-relaxed">We use this to comply with financial regulations. Your data is encrypted and never shared.</p>
            <div>
              <p className="text-sm font-semibold text-white mb-3">Verification method</p>
              <div className="grid grid-cols-2 gap-3">
                {(["bvn","nin"] as const).map(t => (
                  <button key={t} onClick={() => setIdType(t)}
                    className={`py-2.5 px-4 rounded-xl border text-sm font-medium uppercase transition-all ${idType === t ? "border-orange-500/60 bg-orange-500/10 text-orange-300" : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">{idType.toUpperCase()} number</label>
              <input value={idValue} onChange={e => setIdValue(e.target.value.replace(/\D/g, ""))}
                maxLength={11} placeholder={`Enter your ${idType.toUpperCase()}`}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 font-mono tracking-wider" />
              <p className="text-[11px] mt-1.5 text-white/30">
                {idType === "bvn"
                  ? "BVN is verified instantly via Paystack."
                  : "NIN verification is reviewed manually — usually within 1 business day."}
              </p>
            </div>
          </div>
        )}

        {/* Bank account step */}
        {((step === 3 && accountType === "individual") || (step === 4 && accountType === "business")) && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Bank</label>
              <select value={bankCode} onChange={e => {
                setBankCode(e.target.value);
                setBankName(NIGERIAN_BANKS.find(b => b.code === e.target.value)?.name ?? "");
                setAccountName("");
              }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50">
                <option value="">Select bank</option>
                {NIGERIAN_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Account number</label>
              <input value={accountNumber}
                onChange={e => { setAccountNumber(e.target.value.replace(/\D/g, "")); setAccountName(""); }}
                onBlur={resolveAccount}
                maxLength={10} placeholder="0000000000"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 font-mono tracking-wider" />
            </div>
            {resolving && <p className="text-xs text-white/40 animate-pulse">Resolving account name…</p>}
            {accountName && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-sm text-emerald-300 font-medium">{accountName}</span>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-between mt-6">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-sm text-white/40 hover:text-white/70 transition-colors">
              Back
            </button>
          ) : <div />}
          {step < totalSteps ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
              Continue
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={!canNext() || saving}
              className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
              {saving ? "Setting up…" : "Complete Setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
