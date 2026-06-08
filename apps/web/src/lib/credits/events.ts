/**
 * Global "credits changed" event bus — any client-side code that performs a
 * credit-spending or credit-granting action should call `emitCreditsChanged()`
 * once the action succeeds. The CreditsProvider listens for this event and
 * refetches the live balance, which then propagates to the sidebar and topbar
 * in real time (no page refresh required).
 */
export const CREDITS_CHANGED_EVENT = "ld:credits-changed";

export function emitCreditsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_CHANGED_EVENT));
}
