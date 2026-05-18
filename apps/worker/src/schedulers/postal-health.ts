import { exec } from "child_process";
import { promisify } from "util";
import Anthropic from "@anthropic-ai/sdk";
import { adminClient } from "../lib/supabase";
import { upsertNotification, resolveNotification } from "../lib/notify";

const execAsync = promisify(exec);
const APP_URL   = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

// ── Postal DB queries via docker exec ────────────────────────────────────────

async function postalQuery(db: string, sql: string): Promise<string[][]> {
  const escaped = sql.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const cmd = `docker exec postal-mariadb-1 mysql -upostal -ppostalpass --batch --skip-column-names "${db}" -e "${escaped}"`;
  try {
    const { stdout } = await execAsync(cmd, { timeout: 12_000 });
    return stdout.trim().split("\n").filter(Boolean).map(row => row.split("\t"));
  } catch {
    return [];
  }
}

// ── Metric collection ─────────────────────────────────────────────────────────

export interface PostalMetrics {
  window_hours:     number;
  sent:             number;
  hard_fail:        number;
  hard_fail_pct:    number;
  held:             number;
  suppressions_24h: number;
  top_errors:       { reason: string; count: number }[];
  dead_routes:      number;
}

export async function collectPostalMetrics(): Promise<PostalMetrics | null> {
  try {
    const windowSec = 12 * 3600;

    const [statusRows, heldRows, suppRows, errorRows, deadRows] = await Promise.all([
      postalQuery("postal-server-1",
        `SELECT status, COUNT(*) FROM messages WHERE timestamp > UNIX_TIMESTAMP(NOW() - INTERVAL ${windowSec} SECOND) AND status IN ('Sent','HardFail') GROUP BY status`),
      postalQuery("postal-server-1",
        `SELECT COUNT(*) FROM messages WHERE status='Held'`),
      postalQuery("postal-server-1",
        `SELECT COUNT(*) FROM suppressions WHERE timestamp > UNIX_TIMESTAMP(NOW() - INTERVAL 86400 SECOND)`),
      postalQuery("postal-server-1",
        `SELECT d.details, COUNT(*) as cnt FROM deliveries d JOIN messages m ON m.id=d.message_id WHERE m.status='HardFail' AND m.timestamp > UNIX_TIMESTAMP(NOW() - INTERVAL ${windowSec} SECOND) GROUP BY d.details ORDER BY cnt DESC LIMIT 5`),
      postalQuery("postal",
        `SELECT COUNT(*) FROM routes r JOIN http_endpoints h ON h.id=r.endpoint_id WHERE h.url NOT LIKE '%leadash.com%'`),
    ]);

    let sent = 0, hardFail = 0;
    for (const [status, count] of statusRows) {
      if (status === "Sent")     sent     = parseInt(count) || 0;
      if (status === "HardFail") hardFail = parseInt(count) || 0;
    }
    const total         = sent + hardFail;
    const hard_fail_pct = total > 0 ? Math.round((hardFail / total) * 1000) / 10 : 0;
    const held             = parseInt(heldRows[0]?.[0]  ?? "0") || 0;
    const suppressions_24h = parseInt(suppRows[0]?.[0]  ?? "0") || 0;
    const dead_routes      = parseInt(deadRows[0]?.[0]  ?? "0") || 0;
    const top_errors = errorRows.map(([reason, count]) => ({
      reason: reason ?? "unknown",
      count:  parseInt(count) || 0,
    }));

    return { window_hours: 12, sent, hard_fail: hardFail, hard_fail_pct, held, suppressions_24h, top_errors, dead_routes };
  } catch (err) {
    console.error("[postal-health] collectPostalMetrics failed:", err);
    return null;
  }
}

// ── Threshold checks (every 5 min, via health snapshot) ──────────────────────

export async function checkPostalHealth(
  _db: ReturnType<typeof adminClient>,
): Promise<PostalMetrics | null> {
  const metrics = await collectPostalMetrics();
  if (!metrics) return null;

  const { hard_fail_pct, dead_routes, suppressions_24h, held } = metrics;

  // Hard fail rate
  if (hard_fail_pct >= 15) {
    await upsertNotification({
      type: "postal", severity: "critical",
      title: `Postal hard fail rate critical — ${hard_fail_pct}% in last 12h`,
      body:  `${metrics.hard_fail} hard fails out of ${metrics.hard_fail + metrics.sent} attempts. Top error: ${metrics.top_errors[0]?.reason ?? "unknown"}`,
      metadata: metrics as unknown as Record<string, unknown>,
      dedup_key: "postal:hardfail:critical",
    });
    await resolveNotification("postal:hardfail:warning");
  } else if (hard_fail_pct >= 8) {
    await upsertNotification({
      type: "postal", severity: "warning",
      title: `Postal hard fail rate elevated — ${hard_fail_pct}% in last 12h`,
      body:  `${metrics.hard_fail} hard fails out of ${metrics.hard_fail + metrics.sent} attempts.`,
      metadata: metrics as unknown as Record<string, unknown>,
      dedup_key: "postal:hardfail:warning",
    });
    await resolveNotification("postal:hardfail:critical");
  } else {
    await resolveNotification("postal:hardfail:warning");
    await resolveNotification("postal:hardfail:critical");
  }

  // Dead routes — silent reply killer
  if (dead_routes > 0) {
    await upsertNotification({
      type: "postal", severity: "critical",
      title: `Postal has ${dead_routes} route${dead_routes > 1 ? "s" : ""} pointing to dead endpoints`,
      body:  "Inbound replies and bounces will silently fail. Go to Postal → Routing and remove routes not pointing to https://leadash.com/api/outreach/inbound.",
      metadata: { dead_routes },
      dedup_key: "postal:dead_routes:critical",
    });
  } else {
    await resolveNotification("postal:dead_routes:critical");
  }

  // Suppression surge
  if (suppressions_24h >= 20) {
    await upsertNotification({
      type: "postal", severity: "warning",
      title: `Postal suppression list grew by ${suppressions_24h} addresses in last 24h`,
      body:  "May indicate bad lead lists or a deliverability problem. Review suppressed addresses in Postal → Messages → Suppressions.",
      metadata: { suppressions_24h },
      dedup_key: "postal:suppressions:warning",
    });
  } else {
    await resolveNotification("postal:suppressions:warning");
  }

  // Held backlog
  if (held >= 100) {
    await upsertNotification({
      type: "postal", severity: "warning",
      title: `${held} messages held in Postal queue`,
      body:  "Check Postal → Messages → Held for blocked addresses or bouncing recipients.",
      metadata: { held },
      dedup_key: "postal:held:warning",
    });
  } else {
    await resolveNotification("postal:held:warning");
  }

  return metrics;
}

// ── Email transport (mirrors apps/web/src/lib/email/alerts.ts) ───────────────

async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const from      = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.com";
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Leadash <${from}>`, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return;
  }

  const postalHost = process.env.POSTAL_HOST ?? process.env.SMTP_HOST;
  const postalKey  = process.env.POSTAL_API_KEY;
  if (postalHost && postalKey) {
    const res = await fetch(`https://${postalHost}/api/v1/send/message`, {
      method:  "POST",
      headers: { "X-Server-API-Key": postalKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Leadash <${from}>`, to: [opts.to], subject: opts.subject, html_body: opts.html, plain_body: opts.text }),
    });
    if (!res.ok) throw new Error(`Postal API ${res.status}: ${await res.text()}`);
    return;
  }

  throw new Error("No email transport configured — set RESEND_API_KEY or POSTAL_HOST + POSTAL_API_KEY");
}

// ── AI digest (twice daily) ───────────────────────────────────────────────────

export async function runPostalAiDigest(): Promise<void> {
  const db = adminClient();
  const to = process.env.ADMIN_ALERT_EMAIL ?? "malik.proplanstudio@gmail.com";

  const postal = await collectPostalMetrics();

  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [activeCampaigns, recentSends, bouncedSends] = await Promise.all([
    db.from("outreach_campaigns").select("id", { count: "exact", head: true }).in("status", ["active", "running"]),
    db.from("outreach_sends").select("id", { count: "exact", head: true }).in("status", ["sent", "opened", "replied"]).gte("created_at", weekStart),
    db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("status", "bounced").gte("created_at", weekStart),
  ]);

  const appStats = {
    active_campaigns: activeCampaigns.count ?? 0,
    sends_7d:         recentSends.count     ?? 0,
    bounces_7d:       bouncedSends.count    ?? 0,
    bounce_rate_7d:   (recentSends.count ?? 0) > 0
      ? Math.round(((bouncedSends.count ?? 0) / (recentSends.count ?? 0)) * 1000) / 10
      : 0,
  };

  const snapshot = {
    timestamp: new Date().toISOString(),
    postal:    postal ?? { error: "Could not query Postal DB — docker exec may have failed" },
    app:       appStats,
    thresholds: { hard_fail_warning: 8, hard_fail_critical: 15, dead_routes_critical: 0, suppressions_warning: 20, held_warning: 100, bounce_rate_warning: 5 },
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[postal-digest] ANTHROPIC_API_KEY not set — skipping AI digest");
    return;
  }

  const anthropic = new Anthropic({ apiKey });
  const msg = await anthropic.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: `You are a deliverability monitor for Leadash, a B2B email outreach SaaS.
Analyze the Postal MTA health snapshot and respond ONLY with valid JSON (no markdown):
{"status":"ok"|"warning"|"critical","summary":"2-3 sentence overview mentioning key numbers","issues":["specific issue with numbers"],"actions":["concrete step"]}
If everything looks healthy, status=ok and issues=[]. Be specific with numbers. Keep summary tight.`,
    messages: [{ role: "user", content: JSON.stringify(snapshot, null, 2) }],
  });

  let analysis: { status: string; summary: string; issues: string[]; actions: string[] } = {
    status: "unknown", summary: "Could not parse AI analysis.", issues: [], actions: [],
  };
  try {
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    analysis = JSON.parse(raw);
  } catch { /* use fallback */ }

  // Build email
  const statusColor = analysis.status === "ok" ? "#22c55e" : analysis.status === "warning" ? "#f59e0b" : "#ef4444";
  const statusEmoji = analysis.status === "ok" ? "✓" : analysis.status === "warning" ? "⚠️" : "🚨";
  const statusLabel = analysis.status === "ok" ? "All Systems Healthy" : analysis.status === "warning" ? "Warning" : "Critical";
  const issueSuffix = analysis.issues.length > 0 ? ` — ${analysis.issues.length} issue${analysis.issues.length !== 1 ? "s" : ""}` : "";
  const subject     = `[Leadash] Postal Health: ${analysis.status === "ok" ? "OK ✓" : `${statusLabel}${issueSuffix}`}`;

  const metricsRows: [string, string][] = postal ? [
    ["Sent (12h)",             postal.sent.toLocaleString()],
    ["Hard Fail (12h)",        `${postal.hard_fail.toLocaleString()} (${postal.hard_fail_pct}%)`],
    ["Held",                   postal.held.toLocaleString()],
    ["New Suppressions (24h)", postal.suppressions_24h.toLocaleString()],
    ["Dead Routes",            postal.dead_routes.toString()],
    ["Bounce Rate (7d)",       `${appStats.bounce_rate_7d}%`],
    ["Active Campaigns",       appStats.active_campaigns.toString()],
  ] : [];

  const html = `
<div style="font-family:sans-serif;max-width:580px;margin:0 auto;color:#374151">
  <div style="background:linear-gradient(135deg,#1c1917,#1a1a1a);padding:24px 32px;border-radius:14px 14px 0 0;text-align:center">
    <span style="font-size:20px;font-weight:800;color:#fff">Leadash</span>
    <p style="color:#9ca3af;font-size:12px;margin:4px 0 0">Postal Health Digest &middot; ${new Date().toUTCString()}</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;padding:28px 32px">
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid ${statusColor};border-radius:0 10px 10px 0;padding:14px 18px;margin-bottom:22px">
      <p style="margin:0 0 4px;font-weight:700;font-size:15px;color:${statusColor}">${statusEmoji} ${statusLabel}</p>
      <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6">${analysis.summary}</p>
    </div>
    ${analysis.issues.length > 0 ? `
    <p style="font-weight:700;font-size:13px;margin:0 0 8px;color:#111">Issues Found</p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#374151;line-height:1.8">
      ${analysis.issues.map(i => `<li>${i}</li>`).join("")}
    </ul>` : ""}
    ${analysis.actions.length > 0 ? `
    <p style="font-weight:700;font-size:13px;margin:0 0 8px;color:#111">Recommended Actions</p>
    <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;color:#374151;line-height:1.8">
      ${analysis.actions.map(a => `<li>${a}</li>`).join("")}
    </ol>` : ""}
    ${metricsRows.length > 0 ? `
    <p style="font-weight:700;font-size:13px;margin:20px 0 8px;color:#111">Metrics Snapshot</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      ${metricsRows.map(([k, v], i) => `
      <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"}">
        <td style="padding:7px 12px;color:#6b7280;border:1px solid #f3f4f6">${k}</td>
        <td style="padding:7px 12px;font-weight:600;color:#111;border:1px solid #f3f4f6">${v}</td>
      </tr>`).join("")}
    </table>` : ""}
    <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:16px">
      Next check in ~12 hours &middot;
      <a href="${APP_URL}/admin/infrastructure" style="color:#9ca3af">View Infrastructure</a>
    </p>
  </div>
</div>`;

  const text = [
    `${statusEmoji} Postal Health: ${statusLabel}`,
    ``,
    analysis.summary,
    ...(analysis.issues.length  > 0 ? [``, `Issues:`,  ...analysis.issues.map(i      => `  • ${i}`)]           : []),
    ...(analysis.actions.length > 0 ? [``, `Actions:`, ...analysis.actions.map((a, i) => `  ${i + 1}. ${a}`)] : []),
    ...(metricsRows.length      > 0 ? [``, `Metrics:`, ...metricsRows.map(([k, v])    => `  ${k}: ${v}`)]      : []),
    ``,
    `Next check in ~12 hours.`,
  ].join("\n");

  try {
    await sendEmail({ to, subject, html, text });
    console.log(`[postal-digest] sent to ${to} — status=${analysis.status}`);
  } catch (err) {
    console.error("[postal-digest] email send failed:", err);
  }
}
