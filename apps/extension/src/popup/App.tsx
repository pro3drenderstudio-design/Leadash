import React, { useEffect, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Lead {
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  location?: string;
}

type Tab = "settings" | "import" | "comment";

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  container: {
    width: 320,
    minHeight: 400,
    background: "#0d0d0d",
    color: "#fff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 13,
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  header: {
    padding: "12px 16px 0",
    borderBottom: "1px solid #1e1e1e",
  },
  logoRow: {
    display: "flex" as const,
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  logoText: {
    fontSize: 14,
    fontWeight: 700,
    color: "#fff",
    letterSpacing: "-0.02em",
  },
  tabs: {
    display: "flex" as const,
    gap: 2,
  },
  tab: (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 0",
    background: active ? "#1a1a1a" : "transparent",
    border: "none",
    borderBottom: active ? "2px solid #f97316" : "2px solid transparent",
    color: active ? "#fff" : "#666",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    transition: "all 0.15s",
  }),
  body: {
    padding: 16,
    flex: 1,
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: 12,
  },
  label: {
    fontSize: 11,
    color: "#888",
    marginBottom: 4,
    display: "block" as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  input: {
    width: "100%",
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    color: "#fff",
    padding: "8px 10px",
    fontSize: 12,
    outline: "none",
  },
  textarea: {
    width: "100%",
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    color: "#fff",
    padding: "8px 10px",
    fontSize: 12,
    outline: "none",
    resize: "vertical" as const,
    minHeight: 80,
    fontFamily: "inherit",
  },
  btn: (variant: "primary" | "secondary" | "ghost"): React.CSSProperties => ({
    padding: "8px 14px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    background:
      variant === "primary"
        ? "#22c55e"
        : variant === "secondary"
        ? "#1e3a2f"
        : "#1a1a1a",
    color: variant === "primary" ? "#000" : "#fff",
    width: "100%",
    transition: "opacity 0.15s",
  }),
  statusBadge: (ok: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: ok ? "#0f2d1a" : "#2d0f0f",
    color: ok ? "#22c55e" : "#ef4444",
    border: `1px solid ${ok ? "#22c55e33" : "#ef444433"}`,
  }),
  leadCard: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    padding: "8px 10px",
    marginBottom: 6,
  },
  leadName: {
    fontWeight: 600,
    fontSize: 12,
    marginBottom: 2,
  },
  leadMeta: {
    fontSize: 11,
    color: "#888",
    lineHeight: 1.5,
  },
  resultBox: {
    background: "#0f1f18",
    border: "1px solid #22c55e33",
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    lineHeight: 1.6,
    color: "#d1fae5",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  error: {
    color: "#ef4444",
    fontSize: 11,
    background: "#2d0f0f",
    border: "1px solid #ef444433",
    borderRadius: 6,
    padding: "6px 10px",
  },
  success: {
    color: "#22c55e",
    fontSize: 11,
    background: "#0f2d1a",
    border: "1px solid #22c55e33",
    borderRadius: 6,
    padding: "6px 10px",
  },
  divider: {
    borderTop: "1px solid #1e1e1e",
    margin: "4px 0",
  },
  row: {
    display: "flex" as const,
    gap: 8,
    alignItems: "center",
  },
  scrollList: {
    maxHeight: 160,
    overflowY: "auto" as const,
    paddingRight: 2,
  },
};

// ── API helper (via service worker) ──────────────────────────────────────────
async function callApi(
  endpoint: string,
  body: unknown,
  apiKey: string
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "SEND_TO_API", endpoint, method: "POST", body, apiKey },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response ?? { ok: false, error: "No response" });
        }
      }
    );
  });
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsTab() {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    chrome.storage.sync.get(["apiKey"], (res) => {
      if (res.apiKey) {
        setSavedKey(res.apiKey);
        setApiKey(res.apiKey);
        setStatus("ok");
      }
    });
  }, []);

  const save = async () => {
    const key = apiKey.trim();
    if (!key) { setMsg("Please enter an API key."); return; }
    setStatus("checking");
    setMsg("");
    const res = await new Promise<{ ok: boolean; data?: { ok: boolean; workspace_id?: string } }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "SEND_TO_API", endpoint: "/api/extension/auth", method: "GET", body: null, apiKey: key },
        (response) => resolve(response ?? { ok: false })
      );
    });
    if (res.ok && (res.data as { ok?: boolean })?.ok) {
      chrome.storage.sync.set({ apiKey: key });
      setSavedKey(key);
      setStatus("ok");
      setMsg("API key saved successfully.");
    } else {
      setStatus("fail");
      setMsg("Invalid API key. Please check and try again.");
    }
  };

  return (
    <div style={s.body}>
      <div>
        <span style={s.label}>Connection status</span>
        {status === "idle" && <span style={s.statusBadge(false)}>Not configured</span>}
        {status === "checking" && <span style={{ ...s.statusBadge(false), color: "#f59e0b", background: "#2d1f0f", borderColor: "#f59e0b33" }}>Checking...</span>}
        {status === "ok" && <span style={s.statusBadge(true)}>Connected</span>}
        {status === "fail" && <span style={s.statusBadge(false)}>Invalid key</span>}
      </div>

      <div>
        <label style={s.label}>Leadash API Key</label>
        <input
          style={s.input}
          type="password"
          placeholder="ld_live_..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
          Get your key from Leadash Settings &gt; API Keys
        </div>
      </div>

      <button style={s.btn("primary")} onClick={save}>
        Save &amp; Verify
      </button>

      {msg && (
        <div style={status === "ok" ? s.success : s.error}>{msg}</div>
      )}

      {savedKey && (
        <div>
          <div style={s.label}>Active key</div>
          <div style={{ ...s.input, color: "#555", userSelect: "all" as const }}>
            {savedKey.slice(0, 12)}...{savedKey.slice(-4)}
          </div>
          <button
            style={{ ...s.btn("ghost"), marginTop: 8 }}
            onClick={() => {
              chrome.storage.sync.remove("apiKey");
              setSavedKey("");
              setApiKey("");
              setStatus("idle");
              setMsg("Disconnected.");
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

// ── Import Tab ────────────────────────────────────────────────────────────────
function ImportTab() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; list_id: string } | null>(null);
  const [error, setError] = useState("");

  const scanPage = useCallback(() => {
    setScanning(true);
    setScanMsg("");
    setError("");
    setImportResult(null);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        setError("No active tab found.");
        setScanning(false);
        return;
      }
      chrome.tabs.sendMessage(tabId, { type: "SCRAPE_LEADS" }, (response) => {
        setScanning(false);
        if (chrome.runtime.lastError) {
          setError("Could not connect to LinkedIn page. Make sure you are on a LinkedIn search results page.");
          return;
        }
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
    setImporting(true);
    setError("");
    chrome.storage.sync.get(["apiKey"], async (res) => {
      const apiKey = res.apiKey;
      if (!apiKey) {
        setError("No API key configured. Go to Settings first.");
        setImporting(false);
        return;
      }
      const result = await callApi("/api/extension/leads", { leads }, apiKey);
      setImporting(false);
      if (result.ok) {
        setImportResult(result.data as { imported: number; skipped: number; list_id: string });
        setLeads([]);
      } else {
        setError(String((result.data as { error?: string })?.error ?? result.error ?? "Import failed."));
      }
    });
  }, [leads]);

  return (
    <div style={s.body}>
      <div style={{ fontSize: 11, color: "#666", lineHeight: 1.5 }}>
        Navigate to a LinkedIn People search page, then click "Scan this page" to extract visible leads.
      </div>

      <button style={s.btn("primary")} onClick={scanPage} disabled={scanning}>
        {scanning ? "Scanning..." : "Scan this page"}
      </button>

      {scanMsg && <div style={s.success}>{scanMsg}</div>}
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
              <div key={i} style={s.leadCard}>
                <div style={s.leadName}>{lead.name}</div>
                <div style={s.leadMeta}>
                  {lead.title && <div>{lead.title}</div>}
                  {lead.company && <div>{lead.company}</div>}
                  {lead.location && <div>{lead.location}</div>}
                </div>
              </div>
            ))}
          </div>
          <button
            style={s.btn("secondary")}
            onClick={importLeads}
            disabled={importing}
          >
            {importing ? "Importing..." : `Import ${leads.length} lead(s) to Leadash`}
          </button>
        </>
      )}
    </div>
  );
}

// ── Comment Tab ───────────────────────────────────────────────────────────────
function CommentTab() {
  const [postText, setPostText] = useState("");
  const [tone, setTone] = useState("professional");
  const [generating, setGenerating] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    const text = postText.trim();
    if (!text) { setError("Please enter the LinkedIn post text."); return; }
    setGenerating(true);
    setError("");
    setComment("");
    setCopied(false);
    chrome.storage.sync.get(["apiKey"], async (res) => {
      const apiKey = res.apiKey;
      if (!apiKey) {
        setError("No API key configured. Go to Settings first.");
        setGenerating(false);
        return;
      }
      const result = await callApi("/api/extension/ai-comment", { post_text: text, tone }, apiKey);
      setGenerating(false);
      if (result.ok) {
        setComment((result.data as { comment?: string })?.comment ?? "");
      } else {
        setError(String((result.data as { error?: string })?.error ?? result.error ?? "Generation failed."));
      }
    });
  }, [postText, tone]);

  const copy = () => {
    navigator.clipboard.writeText(comment).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={s.body}>
      <div>
        <label style={s.label}>LinkedIn post text</label>
        <textarea
          style={s.textarea}
          placeholder="Paste the LinkedIn post you want to comment on..."
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          rows={4}
        />
      </div>

      <div>
        <label style={s.label}>Tone</label>
        <select
          style={s.input}
          value={tone}
          onChange={(e) => setTone(e.target.value)}
        >
          <option value="professional">Professional</option>
          <option value="casual">Casual &amp; Friendly</option>
          <option value="insightful">Insightful</option>
          <option value="curious">Curious / Question</option>
          <option value="supportive">Supportive</option>
        </select>
      </div>

      <button style={s.btn("primary")} onClick={generate} disabled={generating}>
        {generating ? "Generating..." : "Generate Comment"}
      </button>

      {error && <div style={s.error}>{error}</div>}

      {comment && (
        <>
          <div style={s.label}>Generated comment</div>
          <div style={s.resultBox}>{comment}</div>
          <button style={s.btn("secondary")} onClick={copy}>
            {copied ? "Copied!" : "Copy to clipboard"}
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
          {(["import", "comment", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              style={s.tab(tab === t)}
              onClick={() => setTab(t)}
            >
              {t === "import" ? "Import" : t === "comment" ? "AI Comment" : "Settings"}
            </button>
          ))}
        </div>
      </div>

      {tab === "settings" && <SettingsTab />}
      {tab === "import" && <ImportTab />}
      {tab === "comment" && <CommentTab />}
    </div>
  );
}
