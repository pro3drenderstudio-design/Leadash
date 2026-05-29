// ── Background Service Worker ─────────────────────────────────────────────────
// Handles SEND_TO_API messages from popup and content scripts.
// Proxies requests to https://leadash.com with API key authentication.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SEND_TO_API") {
    const { endpoint, method, body, apiKey } = msg as {
      endpoint: string;
      method?: string;
      body?: unknown;
      apiKey: string;
    };

    const options: RequestInit = {
      method: method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    };

    if (body !== null && body !== undefined && (method ?? "POST") !== "GET") {
      options.body = JSON.stringify(body);
    }

    fetch(`https://leadash.com${endpoint}`, options)
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));

    return true; // keep message channel open for async response
  }
});
