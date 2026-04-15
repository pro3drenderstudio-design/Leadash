// ─── Warmup Pool Email Templates ──────────────────────────────────────────────
// Modular warmup templates assembled from interchangeable parts.
// Combinations: 60 subjects × 50 icebreakers × 50 body1 × 50 body2 × 50 CTAs
// = 450,000,000+ unique emails before first name variation is even counted.

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
  "Update needed from your side",
  "Re: Risk assessment",
  "Quick heads up before Friday",
  "Re: Handoff checklist",
  "Checking in ahead of the deadline",
  "Re: Asset delivery",
  "A note on the rollout plan",
  "Re: Data access request",
  "Pending items — please advise",
  "Re: Quarterly business review",
  "Quick note on the latest draft",
  "Re: Infrastructure changes",
  "Looping you in on a few things",
  "Re: Approval status",
  "Update on resource allocation",
  "Re: Change order",
  "Checking in — anything blocking you?",
  "Re: Final review before launch",
  "Quick note before we proceed",
  "Re: Meeting rescheduled",
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
  "Just a short one from me today.",
  "Hope the quarter is off to a good start.",
  "Checking in before things get too busy.",
  "Just following up while I have a moment.",
  "Hope the rest of your week goes smoothly.",
  "Wanted to reach out before the weekend.",
  "Just a note before I head into some meetings.",
  "Hope things are quieter on your end this week.",
  "Just a quick ping from my side.",
  "Hope everything's running smoothly over there.",
  "Touching base ahead of the busy stretch.",
  "Quick note before the end of the day.",
  "Hope the new month is off to a solid start.",
  "Just circling back as promised.",
  "Wanted to get this on your radar early.",
  "Hope you're staying on top of everything.",
  "Quick one while I have it on my mind.",
  "Just following up from our earlier thread.",
  "Hope things haven't gotten too hectic.",
  "A short note from my end.",
  "Checking in while I still have the context fresh.",
  "Hope your week started off well.",
  "Just a friendly follow-up.",
  "Wanted to reach out before this slips through the cracks.",
  "Hope this is a helpful nudge rather than a nuisance.",
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
  "We've been working through the backlog and are making solid headway. I'll flag anything that needs your input before I proceed.",
  "I've circled back with the relevant team and they've confirmed the details. Just waiting on one more sign-off before we can move to the next step.",
  "The draft is in good shape and just needs a final pass. I'm planning to have it ready to share with you before end of day.",
  "I've been tracking the open items from last session and wanted to give you a brief status update. A few are still in progress, but nothing outside of normal range.",
  "We've identified a solution for the issue we flagged last week. It's straightforward and shouldn't require much on your end to implement.",
  "I've completed my review of the materials and have a few points I'd like to discuss. Nothing blocking — just a few areas worth clarifying before we finalize.",
  "The latest iteration looks much stronger than the previous draft. I've noted a couple of minor tweaks but the overall direction is solid.",
  "We're wrapping up the final details on our side and should be ready to hand this off shortly. I'll make sure everything is clearly documented.",
  "I've had a chance to discuss this internally and we're aligned on the path forward. I'll confirm the specifics with you once we have a firmer plan.",
  "Just a brief update from our side — we've cleared the main blocker and are now moving forward. I'll keep you posted as we hit the next milestones.",
  "I've consolidated the feedback from the various stakeholders and have a clean summary. I can send it over now or include it in our next conversation.",
  "We're on track for the planned delivery. A few minor items remain but nothing that would affect the timeline at this stage.",
  "I've been doing a final check on everything before we proceed and have a couple of questions. Both are minor — just want to make sure we're covering our bases.",
  "I've updated the document to reflect the changes we discussed. The main sections have been revised and everything else has been left as-is.",
  "We've confirmed availability for the proposed schedule. I'll get the invites out shortly and share the agenda ahead of time.",
  "I've been liaising with the third-party team and they've confirmed they can meet our timeline. I'll document the agreement and share it with you.",
  "Just a heads up that I'll be out of office for a couple of days next week. I've briefed a colleague who can handle anything urgent in the meantime.",
  "I've started preparing the materials for the review and expect to have a draft by end of week. I'll make sure it's thorough but digestible.",
  "We've run the initial checks and everything looks clean. I'll do a final pass before we hand it over to your team.",
  "I've been reviewing the scope against the original requirements and there are a couple of small gaps I want to flag before we go further.",
  "The vendor has confirmed they can meet the deadline with the revised spec. I've outlined the key terms and will send the full summary once it's drafted.",
  "I've been monitoring the situation on our end and wanted to give you an early heads up before it affects our timeline.",
  "We've completed the initial phase and the results look promising. I'll put together a brief overview and share it ahead of our next check-in.",
  "I've had a chance to review the latest submission and it's largely in good shape. There are a few areas I'd like to revisit together.",
  "We're making steady progress and expect to hit the next milestone on schedule. I'll keep you posted if anything changes.",
  "I've reached out to the relevant contacts and am waiting to hear back. I'll update you as soon as I have more information.",
  "Just flagging that we're approaching a decision point on this. I wanted to make sure you had all the context before we proceed.",
  "I've put together a short summary of where we stand. It covers the key points and shouldn't take more than a few minutes to read through.",
  "The integration test ran cleanly and we're now ready for the next phase. I'll coordinate with the team to get the next steps scheduled.",
  "I've done a thorough review and the overall quality is strong. I've captured a few improvement suggestions that I'll include in my notes.",
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
  "If anything looks off, flag it and we'll sort it out before it becomes a problem.",
  "I can hold off on this if timing isn't right — just say the word.",
  "Happy to walk you through the details if a quick call would be easier.",
  "If you need more time to review, that's completely fine — just let me know.",
  "I'll send a calendar invite once I hear back from you on timing.",
  "If you'd like a more detailed breakdown, I can put one together.",
  "I'm flexible on timing, so let me know what works best for you.",
  "Feel free to flag any concerns early — better to surface them now than later.",
  "I've cc'd the relevant people so everyone has visibility.",
  "If the scope needs to change, let's discuss before I proceed further.",
  "Let me know if you'd like me to loop anyone else into this thread.",
  "I can adjust the approach if your situation has changed since we last spoke.",
  "Once you're ready to move forward, just give me the green light.",
  "I'll hold off on sending it externally until I hear from you.",
  "If there are any stakeholders I should be aware of, let me know.",
  "I'll make sure the documentation is in order before we proceed.",
  "If the numbers don't look right on your end, let me know and I'll check my figures.",
  "Happy to revisit any part of this if something isn't sitting right.",
  "I'll keep the thread open for now in case you have follow-up questions.",
  "Let me know how you'd like to proceed and I'll get it moving from my side.",
  "If a different format would be more useful, I'm happy to restructure this.",
  "Once you've had a chance to look it over, let me know your thoughts.",
  "I'll check back in later this week if I haven't heard from you.",
  "If the timeline needs shifting, just let me know and I'll update the plan.",
  "I'm copying in my colleague in case they're a better point of contact on this.",
  "Let me know if you need anything else to make your decision.",
  "Happy to set up a quick intro call if that makes things easier.",
  "I can consolidate everything into a single document if that helps.",
  "I'll keep it concise — no need for a long response on your end.",
  "Whenever it's convenient for you is fine with me.",
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
  "Appreciate any feedback you can share.",
  "Looking forward to moving this forward together.",
  "Let me know if you'd like to discuss further.",
  "Thanks for your continued support on this.",
  "Happy to clarify anything that isn't clear.",
  "Look forward to your thoughts.",
  "Thanks for keeping this on your radar.",
  "Let me know when you're ready to proceed.",
  "Feel free to reach out with any questions.",
  "Looking forward to a quick response when you can.",
  "Thanks in advance — really appreciate it.",
  "Let me know what you think at your earliest convenience.",
  "Looking forward to getting this wrapped up.",
  "Happy to get on a quick call to sort this out.",
  "Thanks for your time and attention on this.",
  "Let me know if there's anything I can clarify.",
  "Looking forward to your confirmation.",
  "Thanks — I'll await your feedback before moving forward.",
  "Let me know the best way to proceed from here.",
  "Appreciate you taking the time to review.",
  "Looking forward to your response.",
  "Thanks — no rush, just let me know when you have a moment.",
  "Happy to send more detail if it would be helpful.",
  "Looking forward to resolving this together.",
  "Let me know if timing or scope needs adjusting.",
  "Thanks for keeping me in the loop on this.",
  "Looking forward to a productive next step.",
  "Let me know when it's convenient to connect.",
  "Happy to revisit if you have questions after reviewing.",
  "Thanks — I'll keep an eye out for your reply.",
  "Let me know if I should follow up with anyone else.",
  "Looking forward to collaborating on this.",
  "Thanks for your flexibility on this.",
  "Just let me know and I'll get things moving on my end.",
  "Looking forward to a positive outcome here.",
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
  "Thanks {{name}}, this is exactly what I needed. I'll action it today.",
  "Got it — I'll coordinate on my end and update you soon.",
  "That makes sense. I'll adjust accordingly.",
  "Thanks for keeping this moving, {{name}}. I'll follow suit.",
  "All good here. I'll confirm once things are sorted on my end.",
  "Appreciated — I'll make sure the right people are in the loop.",
  "Thanks for the context, {{name}}. I'll factor this into our planning.",
  "Received. No further action needed from me at this stage.",
  "Perfect timing — I was just about to reach out. I'll take it from here.",
  "Thanks for the reminder. I'll get on this today.",
  "Good to hear things are on track. I'll check in again later this week.",
  "Understood, {{name}}. I'll make sure we're aligned before the deadline.",
  "Thanks — I'll review the details and send any comments by tomorrow.",
  "Received and noted. I'll keep you posted on my end.",
  "That works for me. I'll confirm with the rest of the team.",
  "Thanks for flagging, {{name}}. I'll look into this and follow up.",
  "Appreciate the thorough update. I'll be back in touch shortly.",
  "All noted. I'll make sure nothing slips through on our side.",
  "Got it — I'll draft a response and run it by you before sending.",
  "Thanks {{name}}. I'll take care of this and let you know when it's done.",
  "Makes sense — I'll update the plan on my end accordingly.",
  "Thanks for the quick reply. I'll push this forward from here.",
  "Received. I'll circle back once I've had a chance to look this over.",
  "Appreciate you staying on top of this, {{name}}.",
  "Good to know. I'll factor this into my priorities for the week.",
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
