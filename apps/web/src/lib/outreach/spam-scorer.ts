/**
 * Client + server safe spam scorer — no external deps, no imports.
 * Scores a cold outreach email on a 0–10 scale.
 */

export interface SpamIssue {
  label:    string;
  severity: "low" | "medium" | "high";
  score:    number;
}

export interface SpamResult {
  score:  number;                     // 0–10
  grade:  "A" | "B" | "C" | "D" | "F";
  issues: SpamIssue[];                // negative issues only
  passed: boolean;                    // score < 4
}

const SPAM_PHRASES: Array<{
  pattern:  RegExp;
  score:    number;
  severity: SpamIssue["severity"];
  label:    string;
}> = [
  // ── Prize / lottery ────────────────────────────────────────────────────────
  { pattern: /\bcongratulations\b/i,                    score: 2.0, severity: "high",   label: "Prize/lottery trigger: 'congratulations'" },
  { pattern: /\byou('?ve|\s+have)\s+won\b/i,            score: 2.5, severity: "high",   label: "Classic spam phrase: 'you have won'" },
  { pattern: /\b(won|win)\s+(a\s+)?(prize|award|gift|reward)\b/i, score: 2.0, severity: "high", label: "Prize claim phrase" },
  { pattern: /\b(claim\s+your|collect\s+your)\s+(prize|reward|gift|money|cash)\b/i, score: 2.5, severity: "high", label: "Prize claim trigger" },
  { pattern: /\blottery\b/i,                            score: 2.0, severity: "high",   label: "Lottery keyword" },
  { pattern: /\bjackpot\b/i,                            score: 2.0, severity: "high",   label: "Jackpot keyword" },
  { pattern: /\bsweepstake/i,                           score: 1.5, severity: "high",   label: "Sweepstakes keyword" },
  { pattern: /\bfree\s+gift\b/i,                        score: 1.5, severity: "high",   label: "Spam trigger: 'free gift'" },
  { pattern: /\bfree\s+prize\b/i,                       score: 2.0, severity: "high",   label: "Spam trigger: 'free prize'" },

  // ── Monetary / financial ───────────────────────────────────────────────────
  { pattern: /\b\d+\s*(million|billion)\s*(dollar|pound|euro|usd)/i, score: 2.5, severity: "high", label: "Large monetary amount claim" },
  { pattern: /\$\s*\d[\d,]*\s*(million|billion)\b/i,    score: 2.5, severity: "high",   label: "Large monetary dollar amount" },
  { pattern: /\bmake\s+money\b/i,                       score: 2.0, severity: "high",   label: "Spam trigger: 'make money'" },
  { pattern: /\bearn\s+\$\d/i,                          score: 2.0, severity: "high",   label: "Monetary earn phrase" },
  { pattern: /\b(cash|money)\s+(bonus|reward|prize|gift)\b/i, score: 1.5, severity: "high", label: "Cash reward phrase" },
  { pattern: /\bget\s+paid\b/i,                         score: 1.5, severity: "high",   label: "Spam trigger: 'get paid'" },
  { pattern: /\bincome\s+(from\s+home|opportunity|stream)\b/i, score: 2.0, severity: "high", label: "Income scheme phrase" },
  { pattern: /\bpassive\s+income\b/i,                   score: 1.5, severity: "high",   label: "Spam trigger: 'passive income'" },
  { pattern: /\bwork\s+from\s+home\b/i,                 score: 1.5, severity: "high",   label: "Spam trigger: 'work from home'" },
  { pattern: /\bfinancial\s+freedom\b/i,                score: 1.5, severity: "high",   label: "Spam trigger: 'financial freedom'" },
  { pattern: /\bno\s+(risk|obligation|commitment)\b/i,  score: 1.5, severity: "high",   label: "Risk-free / no-obligation phrase" },
  { pattern: /\brisk.?free\b/i,                         score: 1.0, severity: "medium", label: "Spam trigger: 'risk-free'" },

  // ── Urgency / pressure ─────────────────────────────────────────────────────
  { pattern: /\bact\s+now\b/i,                          score: 1.5, severity: "high",   label: "Urgent action phrase: 'act now'" },
  { pattern: /\blimited\s+time\s+(offer|only|deal)\b/i, score: 1.5, severity: "high",   label: "High-pressure phrase: 'limited time offer'" },
  { pattern: /\bdon'?t\s+miss\s+out\b/i,                score: 1.0, severity: "high",   label: "Urgency phrase: 'don't miss out'" },
  { pattern: /\burgent\b/i,                             score: 0.8, severity: "medium", label: "Urgency word: 'urgent'" },
  { pattern: /\bexpires?\s+(today|soon|tonight|in\s+\d)/i, score: 1.0, severity: "medium", label: "Expiry pressure phrase" },
  { pattern: /\blast\s+chance\b/i,                      score: 1.0, severity: "medium", label: "Pressure phrase: 'last chance'" },
  { pattern: /\bright\s+now\b/i,                        score: 0.5, severity: "low",    label: "Urgency word: 'right now'" },
  { pattern: /\b(buy now|order now)\b/i,                score: 1.5, severity: "high",   label: "Sales command: 'buy/order now'" },

  // ── Free / cost ────────────────────────────────────────────────────────────
  { pattern: /\b100\s*%\s*free\b/i,                     score: 1.5, severity: "high",   label: "Spam trigger: '100% free'" },
  { pattern: /\bno\s+cost\b/i,                          score: 1.0, severity: "medium", label: "Spam trigger: 'no cost'" },
  { pattern: /\babsolutely\s+free\b/i,                  score: 1.5, severity: "high",   label: "Spam trigger: 'absolutely free'" },
  { pattern: /\bfree\s+access\b/i,                      score: 0.5, severity: "low",    label: "Spam trigger: 'free access'" },

  // ── Guaranteed / promises ──────────────────────────────────────────────────
  { pattern: /\bguaranteed\b/i,                         score: 1.0, severity: "medium", label: "Overconfidence trigger: 'guaranteed'" },
  { pattern: /\b(100|one\s+hundred)\s*%\s*guaranteed\b/i, score: 2.0, severity: "high", label: "Spam trigger: '100% guaranteed'" },
  { pattern: /\bdouble\s+your\b/i,                      score: 1.5, severity: "high",   label: "Spam trigger: 'double your'" },
  { pattern: /\btriple\s+your\b/i,                      score: 1.5, severity: "high",   label: "Spam trigger: 'triple your'" },

  // ── Generic sales spam ─────────────────────────────────────────────────────
  { pattern: /\bclick\s+here\b/i,                       score: 1.5, severity: "high",   label: "Generic link text: 'click here'" },
  { pattern: /\bwinner\b/i,                             score: 1.0, severity: "medium", label: "Trigger word: 'winner'" },
  { pattern: /\bexclusive\s+deal\b/i,                   score: 1.0, severity: "medium", label: "Sales phrase: 'exclusive deal'" },
  { pattern: /\bspecial\s+promotion\b/i,                score: 1.0, severity: "medium", label: "Sales phrase: 'special promotion'" },
  { pattern: /\bopt.?in\b/i,                            score: 0.5, severity: "low",    label: "Marketing term: 'opt-in'" },
  { pattern: /\bunsubscribe\b/i,                        score: -0.5, severity: "low",   label: "Unsubscribe text present (good)" },
  { pattern: /\bthis\s+is\s+not\s+spam\b/i,            score: 3.0, severity: "high",   label: "Classic spam self-declaration" },
  { pattern: /\bnot\s+(junk|spam)\b/i,                  score: 2.0, severity: "high",   label: "Spam self-declaration" },
];

export function scoreMessage(subject: string, body: string): SpamResult {
  const issues: SpamIssue[] = [];
  let score = 0;

  const combined = `${subject} ${body}`;

  // ── Phrase checks (subject + body) ─────────────────────────────────────────
  for (const { pattern, score: pts, severity, label } of SPAM_PHRASES) {
    if (pattern.test(combined)) {
      if (pts > 0) issues.push({ label, severity, score: pts });
      score += pts;
    }
  }

  // ── Subject-specific checks ─────────────────────────────────────────────────
  if (subject) {
    // Deceptive Re:/Fwd: prefix
    if (/^(re:|fwd?:)\s*/i.test(subject.trim())) {
      const issue = { label: "Deceptive Re:/Fwd: prefix in subject line", severity: "high" as const, score: 2 };
      issues.push(issue);
      score += 2;
    }

    // Excessive ALL CAPS words in subject
    const subjectWords = subject.split(/\s+/).filter(w => w.length > 2);
    if (subjectWords.length > 0) {
      const capsCount = subjectWords.filter(w => w === w.toUpperCase() && /[A-Z]/.test(w)).length;
      if (capsCount / subjectWords.length > 0.3) {
        issues.push({ label: "Excessive uppercase in subject line", severity: "high", score: 1.5 });
        score += 1.5;
      }
    }

    // Too many punctuation marks in subject
    const subjectPunct = (subject.match(/[!?]/g) ?? []).length;
    if (subjectPunct > 2) {
      issues.push({ label: `Excessive punctuation in subject (${subjectPunct} marks)`, severity: "medium", score: 1 });
      score += 1;
    }
  }

  // ── Body-specific checks ────────────────────────────────────────────────────
  if (body) {
    // Too many exclamation marks
    const exclamations = (body.match(/!/g) ?? []).length;
    if (exclamations > 3) {
      issues.push({ label: `Too many exclamation marks (${exclamations})`, severity: "medium", score: 0.5 });
      score += 0.5;
    }

    // Link density
    const linkCount = (body.match(/https?:\/\//gi) ?? []).length;
    if (linkCount > 3) {
      issues.push({ label: `Too many links in body (${linkCount})`, severity: "medium", score: 1 });
      score += 1;
    }

    // All-caps sentences
    const sentences = body.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const hasCapsBlock = sentences.some(s => {
      const words = s.trim().split(/\s+/).filter(w => w.length > 2);
      if (!words.length) return false;
      return words.filter(w => w === w.toUpperCase() && /[A-Z]/.test(w)).length / words.length > 0.5;
    });
    if (hasCapsBlock) {
      issues.push({ label: "Sentences written in ALL CAPS", severity: "high", score: 1.5 });
      score += 1.5;
    }

    // Raw HTML tags
    if (/<(html|body|div|span|table|td|font|style)\b[^>]*>/i.test(body)) {
      issues.push({ label: "Raw HTML tags in message body", severity: "medium", score: 0.5 });
      score += 0.5;
    }

    // Personalization reduces score (good signal)
    if (/\{\{(first_name|last_name|company|name|title)\}\}/i.test(body)) {
      score -= 0.5;
    }
  }

  score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

  const grade: SpamResult["grade"] =
    score < 2 ? "A" :
    score < 4 ? "B" :
    score < 6 ? "C" :
    score < 8 ? "D" : "F";

  return { score, grade, issues, passed: score < 4 };
}

export function gradeColor(grade: SpamResult["grade"]): string {
  switch (grade) {
    case "A": return "text-emerald-400";
    case "B": return "text-green-400";
    case "C": return "text-amber-400";
    case "D": return "text-orange-400";
    case "F": return "text-red-400";
  }
}

export function gradeBg(grade: SpamResult["grade"]): string {
  switch (grade) {
    case "A": return "bg-emerald-500/10 border-emerald-500/30";
    case "B": return "bg-green-500/10 border-green-500/30";
    case "C": return "bg-amber-500/10 border-amber-500/30";
    case "D": return "bg-orange-500/10 border-orange-500/30";
    case "F": return "bg-red-500/10 border-red-500/30";
  }
}
