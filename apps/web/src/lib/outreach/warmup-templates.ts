// ─── Warmup Pool Email Templates ──────────────────────────────────────────────
// Realistic business emails — no marketing language, no CTAs.
// Used exclusively for inbox-to-inbox warmup pool exchanges.

export interface WarmupTemplate {
  subject: string;
  body: string;
}

export const WARMUP_SEND_TEMPLATES: WarmupTemplate[] = [
  {
    subject: "Quick question about the Q3 timeline",
    body: `Hi,\n\nI wanted to follow up on the Q3 timeline we discussed last week. Do you have an updated estimate for when the deliverables will be ready?\n\nLet me know when you get a chance.\n\nThanks`,
  },
  {
    subject: "Re: Vendor onboarding documents",
    body: `Hi,\n\nJust checking in on the vendor onboarding documents we requested. We're trying to get everything finalized before the end of the month.\n\nCould you send those over when you have a moment?\n\nAppreciate it`,
  },
  {
    subject: "Following up on our call",
    body: `Hi,\n\nIt was great speaking with you earlier this week. I wanted to follow up on a couple of the points we covered.\n\nWould you be available for a brief call Thursday or Friday afternoon to go over the next steps?\n\nLooking forward to it`,
  },
  {
    subject: "Invoice for October services",
    body: `Hi,\n\nPlease find attached the invoice for October services as discussed. Payment terms are net 30 from the invoice date.\n\nLet me know if you have any questions or if anything looks off.\n\nThank you`,
  },
  {
    subject: "Team introduction — new project lead",
    body: `Hi,\n\nI wanted to introduce myself — I've recently taken over as project lead for the ongoing integration work.\n\nI'll be your main point of contact going forward. Looking forward to working together and making sure everything stays on track.\n\nBest`,
  },
  {
    subject: "Updated meeting notes from Tuesday",
    body: `Hi,\n\nAttached are the updated meeting notes from Tuesday's session. I've highlighted the action items and owners for each.\n\nPlease review and let me know if anything needs to be corrected before I circulate to the wider team.\n\nThanks`,
  },
  {
    subject: "Access request for the shared drive",
    body: `Hi,\n\nCould you grant me access to the shared project drive? I've been trying to pull up the latest specs but keep getting a permissions error.\n\nMy email is the one I'm writing from.\n\nAppreciate the help`,
  },
  {
    subject: "Status update on the API integration",
    body: `Hi,\n\nJust a quick status update — we've completed the initial API mapping and are now in testing. We expect to have a working prototype ready by end of next week.\n\nI'll send over a more detailed report once testing wraps up.\n\nCheers`,
  },
  {
    subject: "Checking in — any blockers on your end?",
    body: `Hi,\n\nWanted to check in and see if there are any blockers on your end that might affect the delivery schedule.\n\nWe're on track from our side but wanted to make sure we're aligned before the Thursday sync.\n\nThanks`,
  },
  {
    subject: "Contract renewal — action needed",
    body: `Hi,\n\nOur current service agreement expires at the end of this month. I wanted to reach out early to make sure we have enough time to review and sign the renewal before the deadline.\n\nI've sent over the updated terms separately. Please let me know if you'd like to set up a call to go through them.\n\nBest`,
  },
  {
    subject: "Request for updated contact list",
    body: `Hi,\n\nCould you send over the updated contact list for the project team? We want to make sure our distribution list is current before the next round of communications goes out.\n\nThanks in advance`,
  },
  {
    subject: "Feedback on the latest draft",
    body: `Hi,\n\nI've reviewed the latest draft and have a few minor suggestions. Overall it looks solid — just a couple of sections that could use a bit of tightening.\n\nI'll send over my notes shortly. Let me know if you'd prefer to discuss on a call instead.\n\nThanks`,
  },
  {
    subject: "Reminder: form due by Friday",
    body: `Hi,\n\nJust a quick reminder that the compliance form needs to be submitted by end of day Friday.\n\nIf you've already sent it, please disregard. If not, the link is in the previous email.\n\nLet me know if you run into any issues.\n\nThanks`,
  },
  {
    subject: "Schedule update for next week",
    body: `Hi,\n\nA quick heads up — the team meeting originally planned for Monday has been moved to Wednesday at 2pm.\n\nPlease update your calendar accordingly. The dial-in details remain the same.\n\nSee you then`,
  },
  {
    subject: "Re: Software license renewal",
    body: `Hi,\n\nThanks for sending over the renewal quote. I've reviewed it and it looks reasonable.\n\nI'll need to get sign-off from our finance team before we can proceed. I expect to have an answer for you by early next week.\n\nWill keep you posted`,
  },
  {
    subject: "Quick note on the budget allocation",
    body: `Hi,\n\nI wanted to flag a small discrepancy in the budget allocation spreadsheet you sent over. The Q4 column doesn't seem to add up correctly.\n\nCan you take a look and send a corrected version? Happy to jump on a call if that's easier.\n\nThanks`,
  },
  {
    subject: "Welcome to the team",
    body: `Hi,\n\nJust wanted to reach out and say welcome! We're glad to have you on board.\n\nFeel free to reach out if you have any questions as you get settled in. I'm happy to help with introductions or point you toward the right resources.\n\nLooking forward to working together`,
  },
  {
    subject: "Follow-up: project proposal",
    body: `Hi,\n\nI wanted to follow up on the project proposal I sent over last week. Have you had a chance to review it?\n\nI'm flexible on a few of the scope items if adjustments are needed. Just let me know your thoughts when you get a moment.\n\nBest`,
  },
  {
    subject: "Report attached — please review",
    body: `Hi,\n\nPlease find the monthly report attached. Key highlights are on the first page.\n\nLet me know if you'd like me to walk you through anything in more detail.\n\nThanks`,
  },
  {
    subject: "Confirming our Thursday meeting",
    body: `Hi,\n\nJust confirming our meeting for Thursday at 10am. I've sent a calendar invite to the email on file.\n\nThe agenda will include a brief review of current progress and a discussion of next steps for Q4.\n\nLook forward to connecting`,
  },
];

export const WARMUP_REPLY_TEMPLATES: WarmupTemplate[] = [
  { subject: "", body: "Thanks for the update. I'll review and get back to you shortly." },
  { subject: "", body: "Got it, noted. Will follow up once I've had a chance to look this over." },
  { subject: "", body: "Appreciate the heads up. Looks good from my end." },
  { subject: "", body: "Thanks — I'll check with the team and come back to you." },
  { subject: "", body: "Received. I'll get back to you by end of week." },
  { subject: "", body: "Thanks for sending this over. Will review and confirm." },
  { subject: "", body: "All noted. I'll make sure this gets actioned on our side." },
  { subject: "", body: "Perfect, thank you. I'll pass this along." },
  { subject: "", body: "Sounds good. Let's connect Thursday to go over the details." },
  { subject: "", body: "Thanks for following up. I'll get you a response by tomorrow." },
];

/**
 * Deterministically select a template based on a seed string.
 * Same inbox pair always picks from the same rotation bucket,
 * but different pairs get different templates.
 */
export function selectSendTemplate(seed: string): WarmupTemplate {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % WARMUP_SEND_TEMPLATES.length;
  return WARMUP_SEND_TEMPLATES[idx];
}

export function selectReplyTemplate(seed: string): WarmupTemplate {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % WARMUP_REPLY_TEMPLATES.length;
  return WARMUP_REPLY_TEMPLATES[idx];
}
