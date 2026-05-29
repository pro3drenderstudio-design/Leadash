// ── LinkedIn Content Script ────────────────────────────────────────────────
// Runs on https://www.linkedin.com/* at document_idle.

interface ScrapedLead { name: string; title?: string; company?: string; linkedin_url?: string; location?: string }
interface Persona { name: string; headline: string; offer: string; audience: string }

// ── Lead scraper ──────────────────────────────────────────────────────────────
function scrapeLeads(): ScrapedLead[] {
  const results: ScrapedLead[] = [];
  const seen = new Set<string>();

  document.querySelectorAll(
    ".entity-result__item, .reusable-search__result-container, li.reusable-search__result-container"
  ).forEach((card) => {
    const nameEl =
      card.querySelector(".entity-result__title-text a span[aria-hidden='true']") ||
      card.querySelector(".entity-result__title-text") ||
      card.querySelector("a.app-aware-link span[aria-hidden='true']");
    const name = nameEl?.textContent?.trim() ?? "";
    if (!name || name.toLowerCase() === "linkedin member") return;

    const linkEl = card.querySelector<HTMLAnchorElement>(
      ".entity-result__title-text a[href], a.app-aware-link[href*='/in/']"
    );
    let linkedin_url = linkEl?.href ?? "";
    const match = linkedin_url.match(/https:\/\/www\.linkedin\.com\/in\/[^/?#]+/);
    if (match) linkedin_url = match[0];
    if (!linkedin_url || seen.has(linkedin_url)) return;
    seen.add(linkedin_url);

    results.push({
      name,
      title:       card.querySelector(".entity-result__primary-subtitle")?.textContent?.trim()   || undefined,
      company:     card.querySelector(".entity-result__secondary-subtitle")?.textContent?.trim() || undefined,
      location:    card.querySelector(".entity-result__tertiary-subtitle")?.textContent?.trim()  || undefined,
      linkedin_url,
    });
  });

  return results;
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCRAPE_LEADS") {
    sendResponse({ type: "LEADS_SCRAPED", leads: scrapeLeads() });
    return true;
  }
});

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(text: string, type: "success" | "error" | "info") {
  const t = document.createElement("div");
  const colors = {
    success: { bg: "#0f2d1a", color: "#22c55e", border: "#22c55e44" },
    error:   { bg: "#2d0f0f", color: "#ef4444", border: "#ef444444" },
    info:    { bg: "#0f1a2d", color: "#60a5fa", border: "#60a5fa44" },
  }[type];
  Object.assign(t.style, {
    position: "fixed", bottom: "80px", right: "24px", zIndex: "100000",
    background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
    borderRadius: "8px", padding: "10px 16px", fontSize: "13px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    maxWidth: "300px", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", lineHeight: "1.4",
  });
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Floating import button (search pages) ─────────────────────────────────────
function injectImportButton() {
  if (!window.location.pathname.startsWith("/search/")) return;
  if (document.getElementById("ld-import-btn")) return;

  const btn = document.createElement("button");
  btn.id = "ld-import-btn";
  btn.textContent = "⬆ Import leads to Leadash";
  Object.assign(btn.style, {
    position: "fixed", bottom: "24px", right: "24px", zIndex: "99999",
    background: "#f97316", color: "#fff", border: "none", borderRadius: "8px",
    padding: "10px 18px", fontSize: "13px", fontWeight: "700", cursor: "pointer",
    boxShadow: "0 4px 20px rgba(249,115,22,0.4)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    transition: "opacity 0.2s",
  });
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.85"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "1"; });

  btn.addEventListener("click", () => {
    const leads = scrapeLeads();
    if (!leads.length) { showToast("No leads found on this page.", "error"); return; }
    chrome.storage.sync.get(["apiKey"], (res) => {
      const apiKey = res.apiKey;
      if (!apiKey) { showToast("Open the Leadash extension and connect first.", "error"); return; }
      btn.textContent = `Importing ${leads.length} leads…`;
      btn.style.pointerEvents = "none";
      chrome.runtime.sendMessage(
        { type: "SEND_TO_API", endpoint: "/api/extension/leads", method: "POST", body: { leads }, apiKey },
        (r) => {
          btn.style.pointerEvents = "auto";
          btn.textContent = "⬆ Import leads to Leadash";
          if (r?.ok) {
            const { imported, skipped } = r.data as { imported: number; skipped: number };
            showToast(`Imported ${imported} lead(s), skipped ${skipped} duplicate(s).`, "success");
          } else {
            showToast(String((r?.data as { error?: string })?.error ?? r?.error ?? "Import failed."), "error");
          }
        }
      );
    });
  });

  document.body.appendChild(btn);
}

// ── AI Comment injection on posts ─────────────────────────────────────────────

// Extract text from a LinkedIn post element
function extractPostText(postEl: Element): string {
  const textEl =
    postEl.querySelector(".feed-shared-update-v2__description .feed-shared-text") ||
    postEl.querySelector(".feed-shared-update-v2__description") ||
    postEl.querySelector("[data-test-id='main-feed-activity-card__commentary']") ||
    postEl.querySelector(".feed-shared-text") ||
    postEl.querySelector(".update-components-text");
  return textEl?.textContent?.trim().slice(0, 2000) ?? "";
}

// Click the LinkedIn "Comment" action button for a post
function clickCommentBox(postEl: Element) {
  const commentBtn = postEl.querySelector<HTMLElement>(
    "button[aria-label*='comment' i], button[aria-label*='Comment' i], .comment-button, .feed-shared-social-actions button:nth-child(2)"
  );
  commentBtn?.click();
}

// Find the comment input box for a post
function findCommentBox(postEl: Element): HTMLElement | null {
  return postEl.querySelector<HTMLElement>(
    ".comments-comment-box__form .ql-editor, .comments-comment-texteditor .ql-editor, [contenteditable='true'][data-placeholder*='comment' i]"
  );
}

// Insert text into a LinkedIn comment box (handles contenteditable)
function insertCommentText(box: HTMLElement, text: string) {
  box.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, text);
  // Dispatch input event so LinkedIn's React picks it up
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

// Overlay card showing generated comment
function showCommentCard(anchorEl: HTMLElement, postEl: Element) {
  // Remove any existing card
  document.getElementById("ld-comment-card")?.remove();

  const card = document.createElement("div");
  card.id = "ld-comment-card";
  Object.assign(card.style, {
    position: "absolute", zIndex: "100001",
    background: "#111", border: "1px solid #2a2a2a",
    borderRadius: "10px", padding: "12px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
    width: "320px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "12px", color: "#fff",
  });

  // Position below the button
  const rect = anchorEl.getBoundingClientRect();
  card.style.top  = `${rect.bottom + window.scrollY + 6}px`;
  card.style.left = `${Math.max(8, rect.left + window.scrollX - 80)}px`;

  // Header
  const header = document.createElement("div");
  Object.assign(header.style, { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" });
  header.innerHTML = `
    <span style="font-weight:700;font-size:12px;color:#f97316;">✨ Leadash AI Comment</span>
    <button id="ld-card-close" style="background:none;border:none;color:#666;cursor:pointer;font-size:14px;line-height:1;">✕</button>
  `;
  card.appendChild(header);

  // Tone + length row
  const controls = document.createElement("div");
  Object.assign(controls.style, { display: "flex", gap: "6px", marginBottom: "10px" });
  const toneSelect = document.createElement("select");
  const lengthSelect = document.createElement("select");
  const selectStyle = "background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;color:#ccc;padding:4px 6px;font-size:11px;flex:1;outline:none;";
  toneSelect.setAttribute("style", selectStyle);
  lengthSelect.setAttribute("style", selectStyle);
  [["professional","Professional"],["casual","Casual"],["insightful","Insightful"],["curious","Curious"],["supportive","Supportive"]]
    .forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; toneSelect.appendChild(o); });
  [["short","Short"],["medium","Medium"],["long","Long"]]
    .forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; lengthSelect.appendChild(o); });

  // Load saved defaults
  chrome.storage.sync.get(["defaultTone", "defaultLength"], (res) => {
    if (res.defaultTone)   toneSelect.value   = res.defaultTone;
    if (res.defaultLength) lengthSelect.value = res.defaultLength;
  });

  controls.appendChild(toneSelect);
  controls.appendChild(lengthSelect);
  card.appendChild(controls);

  // Status / result area
  const resultArea = document.createElement("div");
  resultArea.id = "ld-card-result";
  Object.assign(resultArea.style, {
    background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: "6px",
    padding: "8px 10px", fontSize: "12px", lineHeight: "1.6", color: "#ccc",
    minHeight: "50px", marginBottom: "8px", whiteSpace: "pre-wrap", wordBreak: "break-word",
  });
  resultArea.textContent = "Click Generate to create a comment.";
  card.appendChild(resultArea);

  // Credit note
  const creditNote = document.createElement("div");
  Object.assign(creditNote.style, { fontSize: "10px", color: "#555", marginBottom: "8px", textAlign: "right" });
  creditNote.textContent = "1 credit per generation";
  card.appendChild(creditNote);

  // Buttons row
  const btnRow = document.createElement("div");
  Object.assign(btnRow.style, { display: "flex", gap: "6px" });

  const makeBtn = (label: string, bg: string, color: string) => {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
      flex: "1", padding: "7px 0", borderRadius: "5px", border: "none",
      background: bg, color, fontSize: "11px", fontWeight: "600", cursor: "pointer", transition: "opacity 0.15s",
    });
    return b;
  };

  const genBtn  = makeBtn("✨ Generate", "#f97316", "#fff");
  const copyBtn = makeBtn("Copy", "#1a1a1a", "#aaa");
  const useBtn  = makeBtn("Use in Comment", "#1e2a1a", "#4ade80");
  copyBtn.style.display = "none";
  useBtn.style.display  = "none";

  let generatedComment = "";

  genBtn.addEventListener("click", () => {
    const postText = extractPostText(postEl);
    if (!postText) { resultArea.textContent = "Could not read post text."; return; }

    chrome.storage.sync.get(["apiKey", "persona"], (res) => {
      const apiKey = res.apiKey as string | undefined;
      if (!apiKey) { resultArea.textContent = "Not connected. Open the extension → Settings → Login."; return; }

      genBtn.textContent = "Generating…";
      genBtn.style.opacity = "0.6";
      genBtn.style.pointerEvents = "none";
      resultArea.style.color = "#555";
      resultArea.textContent = "Generating…";
      copyBtn.style.display = "none";
      useBtn.style.display  = "none";

      chrome.runtime.sendMessage({
        type: "SEND_TO_API",
        endpoint: "/api/extension/ai-comment",
        method: "POST",
        body: {
          post_text: postText,
          tone:      toneSelect.value,
          length:    lengthSelect.value,
          persona:   res.persona ?? {},
        },
        apiKey,
      }, (response) => {
        genBtn.textContent = "✨ Generate";
        genBtn.style.opacity = "1";
        genBtn.style.pointerEvents = "auto";

        if (response?.ok) {
          const d = response.data as { comment?: string; credits_remaining?: number };
          generatedComment = d.comment ?? "";
          resultArea.style.color = "#d1fae5";
          resultArea.textContent = generatedComment;
          copyBtn.style.display = "block";
          useBtn.style.display  = "block";
          creditNote.textContent = d.credits_remaining !== undefined
            ? `${d.credits_remaining} credits remaining`
            : "1 credit per generation";
        } else {
          const errMsg = (response?.data as { error?: string })?.error ?? response?.error ?? "Generation failed.";
          resultArea.style.color = "#ef4444";
          resultArea.textContent = String(errMsg);
        }
      });
    });
  });

  copyBtn.addEventListener("click", () => {
    if (!generatedComment) return;
    navigator.clipboard.writeText(generatedComment).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
    });
  });

  useBtn.addEventListener("click", () => {
    if (!generatedComment) return;
    clickCommentBox(postEl);
    setTimeout(() => {
      const box = findCommentBox(postEl);
      if (box) { insertCommentText(box, generatedComment); card.remove(); }
      else { showToast("Could not find LinkedIn comment box. Try clicking Comment manually first.", "info"); }
    }, 600);
  });

  btnRow.appendChild(genBtn);
  btnRow.appendChild(copyBtn);
  btnRow.appendChild(useBtn);
  card.appendChild(btnRow);

  // Close button
  document.body.appendChild(card);
  document.getElementById("ld-card-close")?.addEventListener("click", () => card.remove());

  // Close on outside click
  const closeOnOutside = (e: MouseEvent) => {
    if (!card.contains(e.target as Node) && e.target !== anchorEl) {
      card.remove();
      document.removeEventListener("click", closeOnOutside, true);
    }
  };
  setTimeout(() => document.addEventListener("click", closeOnOutside, true), 100);
}

// Inject ✨ button into LinkedIn feed posts
function injectCommentButtons() {
  const postSelectors = [
    ".feed-shared-update-v2",
    "[data-id][data-urn]",
    ".occludable-update",
  ];

  document.querySelectorAll<Element>(postSelectors.join(", ")).forEach((post) => {
    if (post.querySelector(".ld-gen-btn")) return; // already injected

    const actionsBar =
      post.querySelector(".feed-shared-social-actions") ||
      post.querySelector(".social-actions-bar") ||
      post.querySelector("[class*='social-actions']");

    if (!actionsBar) return;

    const btn = document.createElement("button");
    btn.className = "ld-gen-btn";
    btn.textContent = "✨ AI Comment";
    Object.assign(btn.style, {
      display: "inline-flex", alignItems: "center", gap: "4px",
      background: "transparent", border: "1px solid #f9731633",
      color: "#f97316", borderRadius: "16px",
      padding: "4px 10px", fontSize: "12px", fontWeight: "600",
      cursor: "pointer", marginLeft: "8px", transition: "all 0.15s",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    });
    btn.addEventListener("mouseenter", () => { btn.style.background = "#f9731611"; btn.style.borderColor = "#f97316"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; btn.style.borderColor = "#f9731633"; });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showCommentCard(btn, post);
    });

    actionsBar.appendChild(btn);
  });
}

// ── Floating import button + navigation watcher ───────────────────────────────
injectImportButton();
setTimeout(injectCommentButtons, 1000);

let _lastPath = window.location.pathname;
const _observer = new MutationObserver(() => {
  if (window.location.pathname !== _lastPath) {
    _lastPath = window.location.pathname;
    setTimeout(injectImportButton, 800);
  }
  // Re-inject comment buttons when new posts load
  injectCommentButtons();
});
_observer.observe(document.body, { childList: true, subtree: true });
