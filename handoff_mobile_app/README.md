# Handoff: Leadash Native Mobile App (iOS + Android)

A native companion app so users can check outreach campaigns and CRM inboxes on the go. Design reference: `Leadash Mobile App.dc.html` — open it in a browser, use the **iOS/Android** and screen switchers at the bottom to see every screen on both platforms.

## Fidelity & scope
High-fidelity interactive prototype. One design direction, shared across platforms, with native chrome per OS (iOS status bar/Dynamic Island vs Android status bar/gesture nav). Covers, full list → detail → action flows:
- **Home** — stat tiles, 14-day reply trend, "Needs attention" (unhealthy inboxes / paused campaigns), recent replies.
- **Campaigns** — filterable list (status chips) → detail (stats, visual sequence timeline with per-step reply rates, pause/resume).
- **CRM Inbox** — triage list (status filter, star, unread, AI-suggested-reply flag) → thread (message bubbles, AI reply suggestion, full reply composer).
- **Inboxes health** (read-only) — list (health ring, warm-up %, daily limit) → detail (SPF/DKIM/DMARC/MX checks, warm-up + limit bars).
- **Notifications** — grouped feed (Today/Earlier: replies, health issues, milestones) + push banner behavior.

## Recommended stack
**React Native (Expo, managed workflow) — not two separate native codebases.** Rationale: the backend is a single Next.js REST API (`apps/web/src/app/api/outreach/**`) already consumed via a thin typed client (`src/lib/outreach/api.ts`, `src/lib/workspace/client.ts`); a single RN/TS codebase reuses that same mental model (fetch wrappers, typed rows from `src/types/outreach.ts`) and ships both platforms from one PR. Reach for native Swift/Kotlin only if you specifically need capabilities Expo can't reach (none of these screens do).
- Navigation: `@react-navigation/native` — bottom tabs (Home, Campaigns, Inbox, Inboxes) + native stack per tab for detail screens, matching the prototype's tab bar + push-to-detail pattern.
- State/data: `@tanstack/react-query` for all list/detail fetches (matches the existing app's load-on-mount + refetch pattern) — no need for a heavier global store.
- Push: `expo-notifications` → APNs (iOS) + FCM (Android). Register device token against the workspace on login.
- Auth/session: reuse the existing Supabase auth session (same login the web app uses) — do not build a parallel auth system. Store the session + `workspace_id` (mirrors `setWorkspaceId`/`getWorkspaceId` in `lib/workspace/client.ts`) in `expo-secure-store`.
- Design tokens: port the `v2-app` palette directly (`src/v2-app/v2-app.css` — bg `#07070A`, elevated `#0E0E13`, accent `#F97316`, success `#34D399`, warning `#FBBF24`, danger `#F87171`, info `#60A5FA`) into a single RN theme object; do not re-derive colors.

## API mapping (already exists — mobile is a new client, not new backend)
All under `wsFetch`-style calls with `x-workspace-id` header (`apps/web/src/lib/workspace/client.ts`):
- Campaigns: `getCampaigns`, `updateCampaign` (status toggle = pause/resume), `getCampaign(id)`/analytics — see `apps/web/src/lib/outreach/api.ts` and `CampaignsClient.tsx`.
- CRM: `getCrmThreads`, `getConversation(enrollmentId)`, `sendCrmReply`, `updateCrmStatus`, `toggleCrmStar`, `suggestReply` (the AI-suggested-reply chip) — see `CrmClient.tsx`.
- Inboxes: `getInboxes` (includes health/warmup fields), DNS check result shape mirrors `DnsCheckResult` in `InboxesClient.tsx` (`spf`/`dmarc`/`dkim`/`mx`, `score`/`max_score`).
- Dashboard stats: same aggregation as `apps/web/src/app/(app)/dashboard/page.tsx` `getStats()` — either reuse server-side or add a lightweight `/api/mobile/dashboard-summary` that returns the same shape pre-aggregated (cheaper on mobile than 7 parallel queries).
- New for mobile only: `POST /api/mobile/devices` (register push token ↔ workspace/user), and a webhook-triggered push on `outreach_replies` insert (see below).

## Push notification design
Matches the questions answered: **push on new reply, push on campaign milestones (sequence finished, inbox health issue), and a "positive replies only" mode.**
- Trigger point: existing reply-ingestion path (wherever `outreach_replies` rows are inserted, e.g. the reply-matching worker in `apps/worker`) — fan out a push after insert, gated by `ai_category`/`crm_status` when "positive only" is enabled per-user in settings.
- Milestone triggers: campaign completion (`outreach_campaigns.status → completed`), inbox health drop (DNS re-check job in `apps/worker` flips `status` to `warning`/`paused`).
- Payload carries `{ type: "reply"|"milestone"|"health", enrollment_id | campaign_id | inbox_id }` so tapping the push deep-links straight to Thread / Campaign detail / Inbox detail (matches the prototype's push banner → thread flow).
- Respect quiet hours / per-user notification preferences — add a `notification_prefs` column or table (positive-only toggle, quiet hours) surfaced in the app's settings screen (not mocked in the prototype; call this out to design if wanted).

## Design tokens (port as-is)
Same palette as every other Leadash surface in this project: bg `#07070A` / elevated `#0E0E13` / sunken `#050507`, text `#F5F5F7`/`#9CA0AE`/`#5B5B68`, accent `#F97316`, success `#34D399`, warning `#FBBF24`, danger `#F87171`, info `#60A5FA`, violet `#A78BFA` (AI accent, matches the CRM's AI-suggested-reply treatment on web). Type: Geist (bundle the font; RN needs local font files, not a Google Fonts `<link>`). Radii 9/12/14/999 (pill).

## Platform-native details to preserve
- **iOS**: Dynamic Island clearance, home-indicator safe area, iOS-style back chevron, pull-to-refresh with the native spinner, swipe-back gesture on stacks.
- **Android**: Material ripple on list rows, system back button/gesture closes the current stack (no custom back chevron needed in the app bar the way iOS wants one — the prototype already omits it for Android's flow-based nav), edge-to-edge status bar.
- Both: bottom tab badge on Inbox (unread count), pull-to-refresh on all four list screens, haptic tick on status-chip change / star toggle.

## Edge cases to design/build for (beyond the prototype's happy path)
- Empty states: no campaigns yet, zero unread inbox threads, no inboxes connected — reuse the web app's `EmptyState` copy/tone.
- Offline: cache last-fetched lists (react-query's built-in cache is enough for a read-mostly app); disable reply-send with a clear "you're offline" state rather than silently failing.
- Multi-workspace users: a workspace switcher (not in the prototype) if a user belongs to >1 workspace — mirror the web sidebar's workspace picker.
- Long-running AI suggestion fetch: show a loading state on the "AI suggested reply" chip rather than blocking the whole thread.
- Reply send failure (bounced SMTP, rate limit): surface the same `status: "bounced"|"failed"` states the web CRM already renders per-message.

## How to use this handoff with Claude Code
Point Claude Code at the `leadash` repo root and the design reference, then prompt:
> Build a new React Native (Expo) app in `apps/mobile` per `handoff_mobile_app/README.md`. Reuse the existing `/api/outreach/*` endpoints and Supabase auth session — do not duplicate backend logic. Screens: Home, Campaigns (list + detail), CRM Inbox (list + thread + reply), Inboxes health (list + detail, read-only), Notifications. Port the `v2-app` design tokens from `apps/web/src/v2-app/v2-app.css` into a shared RN theme. Open `handoff_mobile_app/Leadash Mobile App.dc.html` in a browser as the visual reference for layout, copy, and interaction — it's an HTML mockup, not code to copy; rebuild each screen as real React Native components.
