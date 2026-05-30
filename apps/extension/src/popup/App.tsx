import React, { useEffect, useState, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Lead {
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  location?: string;
}

interface Persona {
  name:     string;
  headline: string;
  offer:    string;
  audience: string;
}

type Tab = "import" | "comment" | "settings";

const API_BASE = "https://leadash.com";
const AUTH_URL = `${API_BASE}/extension/auth`;

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  container: {
    width: 320,
    minHeight: 420,
    background: "#0d0d0d",
    color: "#fff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 13,
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  header: { padding: "12px 16px 0", borderBottom: "1px solid #1e1e1e" },
  logoRow: { display: "flex" as const, alignItems: "center", gap: 8, marginBottom: 10 },
  logoText: { fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" },
  tabs: { display: "flex" as const, gap: 2 },
  tab: (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "7px 0",
    background: active ? "#1a1a1a" : "transparent",
    border: "none",
    borderBottom: active ? "2px solid #f97316" : "2px solid transparent",
    color: active ? "#fff" : "#555",
    cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400, transition: "all 0.15s",
  }),
  body: {
    padding: 16, flex: 1,
    display: "flex" as const, flexDirection: "column" as const, gap: 12,
    overflowY: "auto" as const, maxHeight: 480,
  },
  label: {
    fontSize: 11, color: "#777", marginBottom: 4,
    display: "block" as const, textTransform: "uppercase" as const, letterSpacing: "0.05em",
  },
  input: {
    width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: 6, color: "#fff", padding: "7px 10px", fontSize: 12, outline: "none",
    boxSizing: "border-box" as const,
  },
  textarea: {
    width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: 6, color: "#fff", padding: "7px 10px", fontSize: 12,
    outline: "none", resize: "vertical" as const, minHeight: 70,
    fontFamily: "inherit", boxSizing: "border-box" as const,
  },
  btn: (variant: "primary" | "secondary" | "ghost" | "danger"): React.CSSProperties => ({
    padding: "8px 14px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600,
    background:
      variant === "primary"   ? "#f97316"
      : variant === "secondary" ? "#1e2a1a"
      : variant === "danger"    ? "#2d1010"
      : "#1a1a1a",
    color: variant === "primary" ? "#fff" : variant === "secondary" ? "#4ade80" : variant === "danger" ? "#f87171" : "#ccc",
    width: "100%", transition: "opacity 0.15s",
  }),
  statusBadge: (state: "ok" | "fail" | "pending"): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: state === "ok" ? "#0f2d1a" : state === "pending" ? "#1f1a0a" : "#2d0f0f",
    color:      state === "ok" ? "#22c55e" : state === "pending" ? "#f59e0b"  : "#ef4444",
    border: `1px solid ${state === "ok" ? "#22c55e33" : state === "pending" ? "#f59e0b33" : "#ef444433"}`,
  }),
  card: {
    background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: 8, padding: "8px 10px",
  },
  resultBox: {
    background: "#0d1f12", border: "1px solid #22c55e22",
    borderRadius: 6, padding: 10, fontSize: 12, lineHeight: 1.6,
    color: "#d1fae5", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const,
  },
  error:   { color: "#ef4444", fontSize: 11, background: "#2d0f0f", border: "1px solid #ef444433", borderRadius: 6, padding: "6px 10px" },
  success: { color: "#22c55e", fontSize: 11, background: "#0f2d1a", border: "1px solid #22c55e33", borderRadius: 6, padding: "6px 10px" },
  divider: { borderTop: "1px solid #1e1e1e", margin: "4px 0" },
  scrollList: { maxHeight: 150, overflowY: "auto" as const },
  creditBadge: {
    display: "inline-flex" as const, alignItems: "center", gap: 4,
    fontSize: 10, color: "#f59e0b", background: "#1f1a0a",
    border: "1px solid #f59e0b22", borderRadius: 10, padding: "2px 7px",
  },
};

// ── API helper (via service worker) ──────────────────────────────────────────
async function callApi(
  endpoint: string,
  method: "GET" | "POST",
  body: unknown,
  apiKey: string
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "SEND_TO_API", endpoint, method, body, apiKey },
      (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(response ?? { ok: false, error: "No response" });
      }
    );
  });
}

// ── Settings / Login Tab ──────────────────────────────────────────────────────
function SettingsTab() {
  const [apiKey,      setApiKey]    = useState("");
  const [connected,   setConnected] = useState(false);
  const [persona,     setPersona]   = useState<Persona>({ name: "", headline: "", offer: "", audience: "" });
  const [tone,        setTone]      = useState("professional");
  const [length,      setLength]    = useState("medium");
  const [saved,       setSaved]     = useState(false);
  const [polling,     setPolling]   = useState(false);
  const [loginMsg,    setLoginMsg]  = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string>("");

  useEffect(() => {
    chrome.storage.sync.get(["apiKey", "persona", "defaultTone", "defaultLength"], (res) => {
      if (res.apiKey) { setApiKey(res.apiKey); setConnected(true); }
      if (res.persona) setPersona(res.persona);
      if (res.defaultTone)   setTone(res.defaultTone);
      if (res.defaultLength) setLength(res.defaultLength);

      // Resume polling if popup was closed mid-auth
      if (!res.apiKey) {
        chrome.storage.local.get(["pendingAuthToken"], (local) => {
          if (local.pendingAuthToken) {
            tokenRef.current = local.pendingAuthToken;
            setPolling(true);
            setLoginMsg("Finishing connection…");
            beginPolling(local.pendingAuthToken);
          }
        });
      }
    });
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function beginPolling(token: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 150) { // 5 min
        clearInterval(pollRef.current!);
        chrome.storage.local.remove("pendingAuthToken");
        setPolling(false);
        setLoginMsg("Connection timed out. Please try again.");
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/extension/auth-poll?token=${token}`);
        const data = await res.json() as { status: string; key?: string };
        if (data.status === "connected" && data.key) {
          clearInterval(pollRef.current!);
          chrome.storage.local.remove("pendingAuthToken");
          chrome.storage.sync.set({ apiKey: data.key });
          setApiKey(data.key);
          setConnected(true);
          setPolling(false);
          setLoginMsg("Connected successfully!");
        } else if (data.status === "expired") {
          clearInterval(pollRef.current!);
          chrome.storage.local.remove("pendingAuthToken");
          setPolling(false);
          setLoginMsg("Connection expired. Please try again.");
        }
      } catch { /* network hiccup, retry */ }
    }, 2000);
  }

  function startLogin() {
    const token = crypto.randomUUID();
    tokenRef.current = token;
    // Persist token so polling can resume if popup closes
    chrome.storage.local.set({ pendingAuthToken: token });
    setPolling(true);
    setLoginMsg("Waiting for you to connect in the browser tab…");
    chrome.tabs.create({ url: `${AUTH_URL}?token=${token}` });
    beginPolling(token);
  }

  function disconnect() {
    chrome.storage.sync.remove("apiKey");
    setApiKey(""); setConnected(false); setLoginMsg("Disconnected.");
  }

  function savePersona() {
    chrome.storage.sync.set({ persona, defaultTone: tone, defaultLength: length });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={s.body}>
      {/* Connection card */}
      <div style={{ ...s.card, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={s.label}>Connection</span>
          <span style={s.statusBadge(connected ? "ok" : polling ? "pending" : "fail")}>
            {connected ? "Connected" : polling ? "Connecting…" : "Not connected"}
          </span>
        </div>

        {!connected && !polling && (
          <button style={s.btn("primary")} onClick={startLogin}>
            Login with Leadash
          </button>
        )}

        {polling && (
          <div style={{ fontSize: 11, color: "#f59e0b", textAlign: "center" }}>
            {loginMsg}
            <div style={{ marginTop: 6 }}>
              <button
                style={{ ...s.btn("ghost"), width: "auto", padding: "4px 12px", fontSize: 11 }}
                onClick={() => { if (pollRef.current) clearInterval(pollRef.current); chrome.storage.local.remove("pendingAuthToken"); setPolling(false); setLoginMsg(""); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {connected && (
          <>
            <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>
              {apiKey.slice(0, 14)}…{apiKey.slice(-4)}
            </div>
            <button style={{ ...s.btn("danger"), padding: "5px 10px" }} onClick={disconnect}>
              Disconnect
            </button>
          </>
        )}

        {loginMsg && !polling && (
          <div style={loginMsg.includes("success") ? s.success : s.error}>{loginMsg}</div>
        )}
      </div>

      {/* Persona settings */}
      <div style={s.divider} />
      <div style={{ fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: -4 }}>Your Persona</div>
      <div style={{ fontSize: 10, color: "#555", marginTop: -8 }}>
        Used by the AI to generate more relevant, personalized comments
      </div>

      {([
        { key: "name",     label: "Your Name",       placeholder: "Alex Johnson" },
        { key: "headline", label: "Headline / Role",  placeholder: "Founder @ Acme | Helping B2B teams grow" },
        { key: "offer",    label: "Your Offer / Value Prop", placeholder: "We help SaaS companies increase demo rates by 40%" },
        { key: "audience", label: "Target Audience",  placeholder: "SaaS founders, VPs of Sales, revenue leaders" },
      ] as { key: keyof Persona; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
        <div key={key}>
          <label style={s.label}>{label}</label>
          <input
            style={s.input}
            value={persona[key]}
            onChange={e => setPersona(p => ({ ...p, [key]: e.target.value }))}
            placeholder={placeholder}
          />
        </div>
      ))}

      {/* Defaults */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={s.label}>Default Tone</label>
          <select style={s.input} value={tone} onChange={e => setTone(e.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="insightful">Insightful</option>
            <option value="curious">Curious</option>
            <option value="supportive">Supportive</option>
          </select>
        </div>
        <div>
          <label style={s.label}>Default Length</label>
          <select style={s.input} value={length} onChange={e => setLength(e.target.value)}>
            <option value="short">Short (1-2 lines)</option>
            <option value="medium">Medium (2-3 lines)</option>
            <option value="long">Long (3-5 lines)</option>
          </select>
        </div>
      </div>

      <button style={s.btn("primary")} onClick={savePersona}>
        {saved ? "✓ Saved" : "Save Settings"}
      </button>
    </div>
  );
}

// ── Import Tab ────────────────────────────────────────────────────────────────
function ImportTab() {
  const [leads,        setLeads]       = useState<Lead[]>([]);
  const [scanning,     setScanning]    = useState(false);
  const [importing,    setImporting]   = useState(false);
  const [scanMsg,      setScanMsg]     = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error,        setError]       = useState("");
  const [pageType,     setPageType]    = useState<"search" | "other" | "unknown">("unknown");

  const scanPage = useCallback(() => {
    setScanning(true); setScanMsg(""); setError(""); setImportResult(null);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = tab?.url ?? "";
      if (!url.includes("linkedin.com")) {
        setError("Navigate to a LinkedIn page first.");
        setScanning(false); return;
      }
      if (!url.includes("/search/")) {
        setPageType("other");
        setScanMsg("Navigate to a LinkedIn People search page to scan leads. (Search → People)");
        setScanning(false); return;
      }
      setPageType("search");
      const tabId = tab?.id;
      if (!tabId) { setError("No active tab."); setScanning(false); return; }
      chrome.tabs.sendMessage(tabId, { type: "SCRAPE_LEADS" }, (response) => {
        setScanning(false);
        if (chrome.runtime.lastError) { setError("Could not connect to LinkedIn page."); return; }
        if (response?.type === "LEADS_SCRAPED") {
          setLeads(response.leads ?? []);
          setScanMsg(`Found ${response.leads?.length ?? 0} lead(s) on this page.`);
        } else {
          setError("Unexpected response from page.");
        }
      });
    });
  }, []);

  const importLeads = useCallback(async () => {
    if (!leads.length) return;
    setImporting(true); setError("");
    chrome.storage.sync.get(["apiKey"], async (res) => {
      const apiKey = res.apiKey;
      if (!apiKey) { setError("Not connected. Go to Settings first."); setImporting(false); return; }
      const result = await callApi("/api/extension/leads", "POST", { leads }, apiKey);
      setImporting(false);
      if (result.ok) {
        setImportResult(result.data as { imported: number; skipped: number });
        setLeads([]);
      } else {
        setError(String((result.data as { error?: string })?.error ?? result.error ?? "Import failed."));
      }
    });
  }, [leads]);

  return (
    <div style={s.body}>
      <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>
        Go to a <strong style={{ color: "#aaa" }}>LinkedIn People search</strong> page, then hit Scan.
      </div>

      <button style={s.btn("primary")} onClick={scanPage} disabled={scanning}>
        {scanning ? "Scanning…" : "Scan this page"}
      </button>

      {pageType === "other" && !scanning && (
        <div style={{ ...s.error, color: "#f59e0b", background: "#1f1a0a", borderColor: "#f59e0b33" }}>
          Not a search page. Go to LinkedIn → Search → People, then scan.
        </div>
      )}
      {scanMsg && pageType !== "other" && <div style={s.success}>{scanMsg}</div>}
      {error && <div style={s.error}>{error}</div>}
      {importResult && (
        <div style={s.success}>
          Imported {importResult.imported} lead(s), skipped {importResult.skipped} duplicate(s).
        </div>
      )}

      {leads.length > 0 && (
        <>
          <div style={s.divider} />
          <div style={s.label}>Preview ({leads.length} leads)</div>
          <div style={s.scrollList}>
            {leads.map((lead, i) => (
              <div key={i} style={{ ...s.card, marginBottom: 5 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{lead.name}</div>
                <div style={{ fontSize: 11, color: "#777", lineHeight: 1.4, marginTop: 2 }}>
                  {lead.title && <div>{lead.title}</div>}
                  {lead.company && <div>{lead.company}</div>}
                </div>
              </div>
            ))}
          </div>
          <button style={s.btn("secondary")} onClick={importLeads} disabled={importing}>
            {importing ? "Importing…" : `Import ${leads.length} lead(s) to Leadash`}
          </button>
        </>
      )}
    </div>
  );
}

// ── AI Comment Tab ────────────────────────────────────────────────────────────
function CommentTab() {
  const [postText,    setPostText]  = useState("");
  const [tone,        setTone]      = useState("professional");
  const [length,      setLength]    = useState("medium");
  const [generating,  setGenerating] = useState(false);
  const [comment,     setComment]   = useState("");
  const [error,       setError]     = useState("");
  const [copied,      setCopied]    = useState(false);
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null);
  const [persona,     setPersona]   = useState<Persona>({ name: "", headline: "", offer: "", audience: "" });

  useEffect(() => {
    chrome.storage.sync.get(["defaultTone", "defaultLength", "persona"], (res) => {
      if (res.defaultTone)   setTone(res.defaultTone);
      if (res.defaultLength) setLength(res.defaultLength);
      if (res.persona)       setPersona(res.persona);
    });
  }, []);

  const generate = useCallback(async () => {
    const text = postText.trim();
    if (!text) { setError("Paste a LinkedIn post first."); return; }
    setGenerating(true); setError(""); setComment(""); setCopied(false);
    chrome.storage.sync.get(["apiKey", "persona", "defaultTone", "defaultLength"], async (res) => {
      const apiKey = res.apiKey;
      if (!apiKey) { setError("Not connected. Go to Settings first."); setGenerating(false); return; }
      const p: Persona = res.persona ?? persona;
      const result = await callApi(
        "/api/extension/ai-comment", "POST",
        { post_text: text, tone, length, persona: p },
        apiKey
      );
      setGenerating(false);
      if (result.ok) {
        const d = result.data as { comment?: string; credits_remaining?: number };
        setComment(d.comment ?? "");
        if (d.credits_remaining !== undefined) setCreditsLeft(d.credits_remaining);
      } else {
        setError(String((result.data as { error?: string })?.error ?? result.error ?? "Generation failed."));
      }
    });
  }, [postText, tone, length, persona]);

  const copy = () => {
    navigator.clipboard.writeText(comment).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div style={s.body}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: "#555" }}>
          Tip: buttons appear on LinkedIn posts automatically. Use this for manual entry.
        </div>
        {creditsLeft !== null && (
          <span style={s.creditBadge}>{creditsLeft} cr</span>
        )}
      </div>

      <div>
        <label style={s.label}>Post text</label>
        <textarea
          style={s.textarea}
          placeholder="Paste the LinkedIn post here…"
          value={postText}
          onChange={e => setPostText(e.target.value)}
          rows={4}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={s.label}>Tone</label>
          <select style={s.input} value={tone} onChange={e => setTone(e.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="insightful">Insightful</option>
            <option value="curious">Curious</option>
            <option value="supportive">Supportive</option>
          </select>
        </div>
        <div>
          <label style={s.label}>Length</label>
          <select style={s.input} value={length} onChange={e => setLength(e.target.value)}>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </div>
      </div>

      <button style={{ ...s.btn("primary"), display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={generate} disabled={generating}>
        {generating ? "Generating…" : <>Generate Comment <span style={{ ...s.creditBadge, background: "rgba(255,255,255,0.1)", border: "none", color: "#f59e0b" }}>1 cr</span></>}
      </button>

      {error && <div style={s.error}>{error}</div>}

      {comment && (
        <>
          <div style={s.resultBox}>{comment}</div>
          <button style={s.btn("secondary")} onClick={copy}>
            {copied ? "✓ Copied!" : "Copy to clipboard"}
          </button>
        </>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>("import");

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.logoRow}>
          <img src="/icons/icon48.png" width={22} height={22} alt="" style={{ borderRadius: 6 }} />
          <span style={s.logoText}>Leadash</span>
        </div>
        <div style={s.tabs}>
          {(["import", "comment", "settings"] as Tab[]).map(t => (
            <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
              {t === "import" ? "Import" : t === "comment" ? "AI Comment" : "Settings"}
            </button>
          ))}
        </div>
      </div>

      {tab === "settings" && <SettingsTab />}
      {tab === "import"   && <ImportTab />}
      {tab === "comment"  && <CommentTab />}
    </div>
  );
}
