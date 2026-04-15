// ─── Warmup Pool Email Templates ──────────────────────────────────────────────
// Modular warmup templates assembled from interchangeable parts.
// Combinations: 40 subjects × 25 icebreakers × 20 body1 × 20 body2 × 15 CTAs
// = 6,000,000+ unique emails before first name variation is even counted.

export interface WarmupTemplate {
  subject: string;
  body: string;
}

// ── Subjects ──────────────────────────────────────────────────────────────────

const SUBJECTS = [
  "Quick question about the timeline",
  "Following up from our last call",
  "Re: Project update",
  "Checking in on next steps",
  "Action needed — please review",
  "Re: Budget approval",
  "Update on the integration work",
  "Notes from yesterday's meeting",
  "Heads up on a scheduling change",
  "Re: Contract review",
  "Quick question on your end",
  "Request for your input",
  "Circling back on this",
  "Quick sync — are you free this week?",
  "Invoice for services rendered",
  "Re: Onboarding documents",
  "Reminder: deadline this Friday",
  "Re: Shared drive access",
  "Following up — any updates?",
  "Proposal feedback requested",
  "Re: Vendor coordination",
  "Status check on deliverables",
  "A few notes from my review",
  "Re: Next quarter planning",
  "Resource request",
  "Re: Team introduction",
  "Confirming our next meeting",
  "Quick note on the draft",
  "Re: Software renewal",
  "Action items from last session",
  "Re: Sign-off needed",
  "Feedback on the revised version",
  "Re: Compliance form submission",
  "Checking availability for a call",
  "Re: Progress report",
  "Quick note on the schedule",
  "Following up on the proposal",
  "Re: Payment terms",
  "End-of-month summary",
  "Re: Scope of work update",
];

// ── Icebreakers (first line after greeting) ───────────────────────────────────

const ICEBREAKERS = [
  "Hope you're having a good week.",
  "Hope things are going smoothly on your end.",
  "I'll keep this brief.",
  "Just a quick follow-up from me.",
  "Hope the week's treating you well.",
  "Just wanted to touch base on a few things.",
  "Reaching out with a quick update.",
  "Hope you had a good weekend.",
  "Just circling back on something from last week.",
  "A quick one from me today.",
  "Hope things are moving along well on your end.",
  "Just a quick note — nothing urgent.",
  "Hope this finds you well.",
  "Following up as promised.",
  "Wanted to catch you before the end of the week.",
  "Hope the month is off to a strong start.",
  "Just looping you in on something.",
  "Quick update from our side.",
  "Hope your morning is off to a good start.",
  "Wanted to touch base before the week wraps up.",
  "Just reaching out with a quick heads up.",
  "Hope things are settling down on your end.",
  "A brief note from me.",
  "Just wanted to keep you in the loop.",
  "Hope you're having a productive day.",
];

// ── Body paragraph 1 (main substance) ────────────────────────────────────────

const BODY_PARA1 = [
  "I wanted to follow up on the timeline we discussed. We're still on track from our side, but I wanted to make sure we're aligned before things progress further.",
  "I've been reviewing the documents you shared and have a few minor notes. Overall, everything looks solid — just a couple of small things worth addressing before we move forward.",
  "We're making good progress on our end and expect to have the updated materials ready by the end of next week. I'll send them over as soon as they're finalized.",
  "I wanted to flag a small discrepancy I noticed in the latest version. It's nothing major, but worth a quick look before we proceed.",
  "Just a heads up that we've completed the first phase and are moving into the next stage. Everything is running to schedule at the moment.",
  "I've been coordinating with the rest of the team and wanted to share a brief update. We've resolved the issue that was causing delays and are back on track.",
  "I wanted to reach out before the end of the week to make sure we have all the information we need. Just a couple of details I wanted to confirm with you.",
  "The revised version is nearly ready — I expect to send it over by tomorrow at the latest. It incorporates all the feedback from the last round of review.",
  "We've had a chance to go through the materials in more detail and have a few questions. Nothing that should hold things up — just want to make sure we're all aligned.",
  "I've been putting together a summary of where things stand and wanted to share it before our next meeting. It's brief but covers the main points.",
  "I wanted to follow up on the action items from last week. Most have been completed, though there are a couple still in progress that I'll update you on shortly.",
  "We're close to wrapping up this phase and wanted to make sure the handoff goes smoothly. I'll send over the relevant files once we're done.",
  "I've reviewed the budget figures and everything looks in order. I'll be forwarding the approval to the relevant team this afternoon.",
  "Just a quick note to confirm that everything is proceeding as planned on our end. No blockers at the moment — we're on track.",
  "I've been in touch with the other stakeholders and they're aligned on the approach. We should be ready to move forward by early next week.",
  "The reporting period just wrapped up and I've been compiling the numbers. I'll have the full summary ready for you shortly.",
  "I wanted to reach out before the deadline to confirm that everything is in place. We should be in good shape, but wanted to double-check a few details.",
  "We've made a few adjustments based on the feedback received. The changes are minor but should address the concerns that were raised in the last review.",
  "I've been going through the latest round of updates and have a few observations. I'll include them in my notes when I send them over later today.",
  "I wanted to give you a heads up before the changes go into effect. Nothing that should impact your side significantly, but better to keep you in the loop.",
];

// ── Body paragraph 2 (secondary / bridging) ───────────────────────────────────

const BODY_PARA2 = [
  "Let me know if there's anything on your end that might affect the timing.",
  "If anything has changed on your side, feel free to flag it and we can adjust accordingly.",
  "I'd appreciate your input before we finalize things — even a brief reply would be helpful.",
  "Happy to schedule a quick call if it's easier to walk through this together.",
  "I'll follow up again early next week if I haven't heard back by then.",
  "Please let me know if the format works for you or if you'd prefer something different.",
  "I can send over additional context if that would be useful.",
  "Just want to make sure we're not holding anything up on your end.",
  "Feel free to pass this along to whoever handles this on your team.",
  "Let me know if the proposed timing still works for you.",
  "If you have any concerns, I'm happy to discuss them before we proceed.",
  "I'll keep this brief since I know you're likely juggling a lot right now.",
  "I wanted to make sure this is on your radar ahead of the deadline.",
  "Please don't hesitate to reach out if anything is unclear.",
  "I'll make sure the relevant people on our side are copied going forward.",
  "Happy to provide more detail if needed — just say the word.",
  "If priorities have shifted on your end, just let me know and we can work around it.",
  "I'll keep you posted as things develop on our side.",
  "No rush on a response — just wanted to make sure you had the latest.",
  "Let me know if you'd prefer to handle this over a call instead.",
];

// ── CTAs (closing line) ───────────────────────────────────────────────────────

const CTAS = [
  "Let me know when you get a chance.",
  "Looking forward to hearing from you.",
  "Thanks in advance for taking a look.",
  "Let me know your thoughts when you have a moment.",
  "Appreciate your time on this.",
  "Looking forward to your feedback.",
  "Thanks — let me know how you'd like to proceed.",
  "Happy to jump on a call if that's easier.",
  "Looking forward to connecting soon.",
  "Let me know if you need anything else from my side.",
  "Thanks for staying on top of this.",
  "I'll leave it with you for now.",
  "Let me know what works best for you.",
  "Thanks — looking forward to your reply.",
  "Just let me know and we'll take it from there.",
];

// ── Reply templates ───────────────────────────────────────────────────────────
// {{name}} is replaced with the original sender's first name at runtime.

const REPLY_BODIES = [
  "Thanks for the update, {{name}}. I'll take a look and get back to you shortly.",
  "Got it — thanks for flagging that. I'll follow up once I've had a chance to review.",
  "Appreciate the heads up. Looks good from my end.",
  "Thanks, {{name}}. I'll check with the team and come back to you.",
  "Received. I'll get back to you by end of week.",
  "Thanks for sending this over. Will review and confirm.",
  "All noted, {{name}}. I'll make sure this gets actioned on our side.",
  "Perfect, thank you. I'll pass this along to the right person.",
  "Sounds good. Let's connect later this week to go over the details.",
  "Thanks for following up. I'll have a response for you by tomorrow.",
  "Appreciate you keeping me in the loop on this.",
  "Good to know — I'll factor that in on our side.",
  "Thanks, {{name}}. This is helpful. I'll reach out if I have any follow-up questions.",
  "Noted. I'll update the relevant people on our end.",
  "Thanks for the quick turnaround on this.",
  "Much appreciated. I'll review and get back to you.",
  "Got it. I'll make a note and follow up accordingly.",
  "Thanks for clarifying — that helps a lot.",
  "I'll take it from here. Thanks for the heads up.",
  "Understood. I'll reach out if anything changes on our end.",
  "Thanks, {{name}}. Will do.",
  "Acknowledged. I'll loop in the rest of the team.",
  "Good timing on this — thanks for sending it over.",
  "Appreciate the update. I'll be in touch.",
  "Noted, thanks. I'll get back to you if I have any questions.",
];

// ── Hash helpers ──────────────────────────────────────────────────────────────

/** Independent hash for each component slot — avoids all parts moving in sync */
function pick<T>(arr: T[], seed: string, slot: number): T {
  let h = (slot + 1) * 2654435761;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 1597334677);
  }
  return arr[(h >>> 0) % arr.length];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Assemble a warmup send email from modular parts.
 * senderName   — first_name of the sending inbox (used in sign-off)
 * recipientName — first_name of the receiving inbox (used in greeting)
 */
export function selectSendTemplate(
  seed: string,
  senderName?: string | null,
  recipientName?: string | null,
): WarmupTemplate {
  const greeting  = recipientName ? `Hi ${recipientName},` : "Hi,";
  const signoff   = senderName ?? "";

  const subject    = pick(SUBJECTS,    seed, 0);
  const icebreaker = pick(ICEBREAKERS, seed, 1);
  const para1      = pick(BODY_PARA1,  seed, 2);
  const para2      = pick(BODY_PARA2,  seed, 3);
  const cta        = pick(CTAS,        seed, 4);

  const bodyLines = [greeting, "", icebreaker, "", para1, "", para2, "", cta];
  if (signoff) bodyLines.push("", signoff);

  return { subject, body: bodyLines.join("\n") };
}

/**
 * Select a reply template.
 * senderName — first_name of the person being replied to ({{name}} placeholder)
 */
export function selectReplyTemplate(
  seed: string,
  senderName?: string | null,
): WarmupTemplate {
  const raw  = pick(REPLY_BODIES, seed, 0);
  const body = senderName
    ? raw.replace(/\{\{name\}\}/g, senderName)
    : raw.replace(/,?\s*\{\{name\}\}/g, "");
  return { subject: "", body };
}
