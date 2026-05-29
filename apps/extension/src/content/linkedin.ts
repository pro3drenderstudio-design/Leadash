// ── LinkedIn Content Script ───────────────────────────────────────────────────
// Runs on https://www.linkedin.com/* pages at document_idle.

interface ScrapedLead {
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  location?: string;
}

function scrapeLeads(): ScrapedLead[] {
  const results: ScrapedLead[] = [];
  const seen = new Set<string>();

  // LinkedIn People Search result cards
  const cards = document.querySelectorAll(
    ".entity-result__item, .reusable-search__result-container, li.reusable-search__result-container"
  );

  cards.forEach((card) => {
    // Name — try multiple selectors
    const nameEl =
      card.querySelector(".entity-result__title-text a span[aria-hidden='true']") ||
      card.querySelector(".entity-result__title-text") ||
      card.querySelector("a.app-aware-link span[aria-hidden='true']");
    const name = nameEl?.textContent?.trim() ?? "";
    if (!name || name.toLowerCase() === "linkedin member") return;

    // Profile URL
    const linkEl = card.querySelector<HTMLAnchorElement>(
      ".entity-result__title-text a[href], a.app-aware-link[href*='/in/']"
    );
    let linkedin_url = linkEl?.href ?? "";
    // Normalise: strip query params after /in/slug
    const match = linkedin_url.match(/https:\/\/www\.linkedin\.com\/in\/[^/?#]+/);
    if (match) linkedin_url = match[0];

    if (!linkedin_url) return; // can't deduplicate without URL
    if (seen.has(linkedin_url)) return;
    seen.add(linkedin_url);

    const title =
      card.querySelector(".entity-result__primary-subtitle")?.textContent?.trim() || undefined;
    const company =
      card.querySelector(".entity-result__secondary-subtitle")?.textContent?.trim() || undefined;
    const location =
      card.querySelector(".entity-result__tertiary-subtitle")?.textContent?.trim() || undefined;

    results.push({ name, title, company, linkedin_url, location });
  });

  return results;
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCRAPE_LEADS") {
    const leads = scrapeLeads();
    sendResponse({ type: "LEADS_SCRAPED", leads });
    return true;
  }
});

// ── Floating "Import leads" button ────────────────────────────────────────────
function injectImportButton() {
  // Only on search pages
  if (!window.location.pathname.startsWith("/search/")) return;
  if (document.getElementById("ld-import-btn")) return;

  const btn = document.createElement("button");
  btn.id = "ld-import-btn";
  btn.textContent = "⬆ Import leads to Leadash";
  Object.assign(btn.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "99999",
    background: "#22c55e",
    color: "#000",
    border: "none",
    borderRadius: "8px",
    padding: "10px 18px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(34,197,94,0.4)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    transition: "opacity 0.2s",
  });

  btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.85"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "1"; });

  btn.addEventListener("click", () => {
    const leads = scrapeLeads();
    if (!leads.length) {
      showToast("No leads found on this page.", "error");
      return;
    }

    chrome.storage.sync.get(["apiKey"], (res) => {
      const apiKey = res.apiKey;
      if (!apiKey) {
        showToast("No API key configured — open the Leadash extension first.", "error");
        return;
      }

      btn.textContent = `Importing ${leads.length} leads...`;
      btn.style.pointerEvents = "none";

      chrome.runtime.sendMessage(
        {
          type: "SEND_TO_API",
          endpoint: "/api/extension/leads",
          method: "POST",
          body: { leads },
          apiKey,
        },
        (response) => {
          btn.style.pointerEvents = "auto";
          btn.textContent = "⬆ Import leads to Leadash";
          if (response?.ok) {
            const { imported, skipped } = response.data as { imported: number; skipped: number };
            showToast(`Imported ${imported} lead(s), skipped ${skipped} duplicate(s).`, "success");
          } else {
            const errMsg = (response?.data as { error?: string })?.error ?? response?.error ?? "Import failed.";
            showToast(String(errMsg), "error");
          }
        }
      );
    });
  });

  document.body.appendChild(btn);
}

function showToast(message: string, type: "success" | "error") {
  const toast = document.createElement("div");
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "80px",
    right: "24px",
    zIndex: "100000",
    background: type === "success" ? "#0f2d1a" : "#2d0f0f",
    color: type === "success" ? "#22c55e" : "#ef4444",
    border: `1px solid ${type === "success" ? "#22c55e44" : "#ef444444"}`,
    borderRadius: "8px",
    padding: "10px 16px",
    fontSize: "13px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    maxWidth: "280px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
  });
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Inject on load and watch for navigation (LinkedIn is a SPA)
injectImportButton();

let _lastPath = window.location.pathname;
const _observer = new MutationObserver(() => {
  if (window.location.pathname !== _lastPath) {
    _lastPath = window.location.pathname;
    setTimeout(injectImportButton, 800); // wait for DOM to settle
  }
});
_observer.observe(document.body, { childList: true, subtree: true });
