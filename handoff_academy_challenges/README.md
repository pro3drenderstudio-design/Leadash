# Handoff: Academy Challenges

## Overview
**Challenges** are a new Academy product type that sits alongside **Courses**. A challenge is a time-boxed, accountability-driven sprint (e.g. the *30-Day $0 → $2,500 Challenge*): one focused task per day/week, streaks, points, a live leaderboard, real-revenue tracking, and prizes. Challenges can be free or paid, gated to cohorts, and wired into a funnel (FB Ads → free opt-in → free course → **paid challenge** → Academy Package upsell).

This package designs **both sides**:
- **Admin** (`/admin/academy`): a Funnel Map, a Challenge Builder, and Challenge Analytics.
- **Learner** (`/academy`): a sales/enroll page, a challenge dashboard, a per-day task/submission view, and a leaderboard.

It is meant to **plug into the existing Academy** — same data layer, same routes, same design tokens — not replace it.

## About the design file
`Academy Challenges.dc.html` is a **working design reference** (open it in a browser; use the floating Admin⇄Learner switcher at the bottom to move between all 7 screens). It was authored in a small self-contained component runtime that renders via `React.createElement`, so **the markup style will not match the codebase** — do not copy it verbatim. Recreate each screen as real Next.js/React/TypeScript using the existing app's patterns and components. All numbers/people/copy in the file are demo seed data.

`previews/` contains PNGs of each screen for reference.

## Fidelity
**High-fidelity.** Layout, spacing, color, type, and interaction behavior in the prototype are the intended design. Reproduce them faithfully, expressed with the existing token system and components.

## Tech context (match the existing app)
- **Next.js App Router + React + TypeScript + Tailwind v4.**
- The in-app surface uses the **`v2-app` token system** (`apps/web/src/v2-app/v2-app.css`), scoped under the `.v2-app` class. The existing admin academy page (`apps/web/src/app/(admin)/admin/academy/page.tsx`) wraps itself in `className="v2-app academy-admin"` and styles with `var(--app-*)` tokens plus the `.ac-input/.ac-select/.ac-card/.ac-table/.ac-chip` helper classes defined inline there — **reuse that exact approach** for the new admin screens.
- The learner academy pages (`apps/web/src/app/(app)/academy/**`) import `@/v2-app/v2-app.css`, wrap in `.v2-app`, and mix `var(--app-*)` with Tailwind `white/x` opacity utilities (which the globals remap). Follow the surrounding files' conventions per screen.
- Icons: admin uses **`@hugeicons/react`** (`HugeiconsIcon` + `@hugeicons/core-free-icons`). Use those, not inline SVG. The prototype's inline-SVG path sets are only a visual guide.
- Money: `formatNgn()` from `@/types/academy` for ₦. Challenge **outcome earnings are in USD** ($0 → $2,500) — render `$` for the earnings board / revenue-reported fields, ₦ everywhere else (prices, payouts).
- Fonts: Geist (already loaded). Monospace numerics use the app's existing mono stack.

## Design tokens (from `v2-app.css` — use the `var()` names, don't hardcode)
- Surfaces: `--app-bg` `#07070A` · `--app-bg-elevated` `#0E0E13` (cards) · `--app-bg-sunken` `#050507` (headers/rails) · `--app-surface` / `--app-surface-strong` (hover/active fills).
- Borders: `--app-border` (.06 white) · `--app-border-strong` (.10).
- Text: `--app-text` `#F5F5F7` · `--app-text-muted` `#9A9AA8` · `--app-text-quiet` `#5B5B68` · `--app-text-faint` `#2A2A33`.
- Accent: `--app-accent` `#F97316` · `--app-accent-hover` · `--app-accent-soft` (.12) · `--app-accent-line` (.30).
- Status: `--app-success` `#34D399` · `--app-warning` `#FBBF24` · `--app-danger` `#F87171` · `--app-info` `#60A5FA`.
- Radii: `--app-radius-sm` 6 · `--app-radius` 8 · `--app-radius-lg` 12 · pill 999. Type scale: h1 28 / h2 20 / h3 16 / body 14 / sm 13 / small 12 / micro 11. Motion: `--app-ease` `cubic-bezier(0.16,1,0.3,1)`, `--app-dur` 180ms.
- **Task-type accent colors** (used consistently across builder, dashboard, day view, sales): lesson `#60A5FA` · proof `#F97316` · self-check `#34D399` · metric `#A78BFA` · live `#F472B6` · quiz `#FBBF24`.

---

## Data model
Challenges reuse most of `@/types/academy` (`apps/web/src/types/academy.ts`). Extend rather than fork.

### 1. `AcademyProduct` — add a challenge variant
- Add `product_type: "course" | "challenge"` (default `"course"`).
- Add challenge config (nullable for courses), e.g. a `challenge_config` JSON or columns:
  - `cadence: "daily" | "weekly" | "custom"`, `duration_days: number`.
  - `start_mode: "fixed_cohort" | "rolling"` (rolling = starts on enroll).
  - `grace_days: number` (streak freezes per learner), `catchup_enabled: boolean`.
  - `leaderboard_enabled`, `points_board_enabled`, `earnings_board_enabled`, `earnings_require_proof`, `earnings_reset: "all_time" | "weekly" | "daily"`.
  - `auto_advance_offer`: `{ enabled, trigger: "day1"|"day7"|"graduation"|"manual", window_hours, target_product_id, discount_type, discount_value }`.
  - `reminders`: `{ email, whatsapp, daily_unlock_time, timezone, nudge_missed }`.
- `pricing_type`/`price_ngn` already exist → free vs paid vs cohort_only is already modeled.

### 2. Challenge schedule = reuse Sections/Lessons, add Tasks
A challenge **Day** maps cleanly to an `AcademySection` (one per day), `position` = day number, with the existing `drip_type: "days_after_enrollment" | "days_after_cohort_start"` and `drip_value`. Inside a day, model **Tasks** (new) — a day has 1..n tasks:
```
AcademyChallengeTask {
  id, product_id, day (int), position,
  task_type: "lesson" | "proof" | "self_check" | "metric" | "live" | "quiz",
  title, points (int),
  lesson_id?            // for "lesson": links an AcademyLesson (reuse video/mux pipeline)
  proof_config?         // { accepts: ["image","file","link","text"], prompt }
  metric_config?        // { source: "leadash_outbox" | "manual", metric: "messages_sent" | ..., target: int }
  live_session_id?      // reuse AcademyLiveSession
  quiz_config?          // reuse existing quiz content_json
}
```
(If you prefer not to add sections-per-day, a single `challenge_days` table with an embedded tasks array works too — but reusing Sections gives you drip + ordering + the existing admin curriculum plumbing for free.)

### 3. Progress, streaks, points — reuse `AcademyGamification`
`AcademyGamification` already has `points`, `streak_days`, `last_active_date`, `badges`. Add:
- `AcademyChallengeTaskCompletion { enrollment_id, task_id, day, status, proof_files?, proof_text?, metric_value?, points_awarded, completed_at }`.
- `reported_earnings_cents` (USD) on the enrollment or gamification row, with an optional `earnings_proof_url` and `verified` flag (for the earnings board when `earnings_require_proof`).
- Streak logic = consecutive days with all required tasks complete; `grace_days` allow N misses before reset; catch-up lets a learner complete a past day late (counts for points, configurable whether it restores streak). `isLessonUnlocked()` in `academy.ts` is the model to extend for day unlocking.

### 4. Leaderboard
Two ranked queries over a cohort: **points** (`AcademyGamification.points`) and **earnings** (`reported_earnings_cents`, only `verified` rows when required). Support scope = this-week vs all-time.

---

## Screens

### ADMIN

#### A1 — Funnel Map  (`/admin/academy` → Funnels, or a new `funnel` tab)
A horizontal pipeline of stage cards: **Facebook Ads → Free Course Opt-in → Free Course → 30-Day Challenge → Academy Package**. Each card: icon (in a tinted square using the stage color), name, kind tag, primary metric (reach/entered, big mono number), and revenue (green) when > 0. Between cards: the **next stage's conversion %** in that stage's color + an arrow. The challenge card carries a small "This challenge" badge.
- Selecting a card highlights it (colored ring) and fills a bottom **inspector** (left, ~1.4fr): header with icon/name/sub + an action button (**Open builder** for the challenge stage, **Edit step** otherwise), then rows: Entered, Continue-to-next %, Revenue, and a contextual note (challenge note explains the auto-advance package offer).
- Right column (~1fr): **Funnel totals** card (ad→package %, total revenue, ROAS, paid enrollments) and a **Biggest drop-off** insight card with a "Create A/B test" action.
- Header actions: "Add step", date-range chip.
- Reuse any existing funnel/analytics endpoints; the per-stage metrics come from the funnel + enrollment data.

#### A2 — Challenge Builder  (course-detail style, inside `/admin/academy` when a `product_type==="challenge"` is opened)
Top header matches the existing academy admin (breadcrumb `Academy / Challenges / <name>`, title + **Live** chip, **Preview** + **Save changes**). Below the header, a **tab bar**: Setup · Schedule · Rewards & Points · Leaderboard · Funnel & Offers · Reminders · Settings. (Mirror the existing admin's `CourseView` left-rail/tab pattern.)

- **Setup** — name, tagline, description, duration + cadence, cover image + trailer (reuse `CourseBannerEditor`).
- **Schedule** (the centerpiece) — a summary strip (Duration, Cadence, Total tasks, Total points, Live sessions), then a 2-column layout:
  - **Left:** the day list grouped by week (Week 1–4 headers), each day row = day number chip, title, small task-type glyphs, points. Reuse `SortableList` for drag-reorder. "Add day".
  - **Right:** the selected day's **editor** — day title, a **task-type picker** (2-col grid of toggleable cards: Watch lesson / Submit proof / Self-check / Hit metric / Live session / Quiz, each in its task color), points, unlock/drip, and Save/Duplicate/Delete. Each enabled task type then needs its own config (lesson picker, proof accepts, metric source+target, live session, quiz) — the prototype shows the selection layer; wire each type's detail editor using existing editors where possible (`LessonContentEditor`, live session, quiz).
- **Rewards & Points** — a points-engine rules list (task value, streak bonus, on-time proof, first-to-finish, miss=reset), a **Badges** grid (Fast Starter, Week Warrior, First Dollar, Closer, Graduate), and a **Prizes** list (1st/2nd/3rd).
- **Leaderboard** — master visibility toggle, the two boards (Points / Earnings) each toggleable, and earnings verification (require proof, reset frequency).
- **Funnel & Offers** — shows the funnel chain with this challenge highlighted (link to A1), the **Auto-advance to Academy Package** toggle, and when on: package offer config (trigger, offer window, challenger discount, target product).
- **Reminders** — Email + WhatsApp channel toggles, daily unlock time + timezone, "nudge learners who miss a day", and a **sequence preview** (08:00 unlock, 14:00 nudge, 20:00 streak warning, next-day recap).
- **Settings** — pricing (Free / Paid ₦ / Cohort-only) with price + compare-at, **catch-up mode** toggle, **grace days** slider (0–5), start mode + completion threshold + certificate toggle (reuse existing), and a **refund window** card (7-day refund; refunding revokes access + removes from leaderboard).

#### A3 — Challenge Analytics  (`/admin/academy` → a challenge's Analytics)
- Five metric tiles: Enrolled, Active today, Completion rate, Avg streak, Revenue reported ($).
- **Daily completion retention** bar chart (one bar per day 1–30; past days = accent, today highlighted, upcoming = muted) with legend.
- **Winner selection** card: top-3 list with medals + avatars + points, "Auto-pick winners" (from leaderboard) and manual override. Surfaces near cohort end.
- **Participants table**: avatar+name, progress bar (Day N / 30), streak (flame, warn color ≥10), points, reported $ (green), status chip (Active / At risk / Graduated), row → participant detail. Cohort selector + "Message all" (broadcast). Reuse the existing `.ac-table` styling and the admin's enrollment data; add cohort filtering.

### LEARNER

#### L1 — Sales / Enroll page  (`/academy/[product]` when product is a challenge, or `/academy/enroll/[product]`)
Centered long-form page: badge → big headline (`$0` muted → `$2,500` accent) → subhead → **Enrol now · ₦10,000** CTA with compare-at + refund note → **countdown** to cohort close → social-proof stat strip. Then **How the 30 days work** (6 feature cards in task colors: daily lessons, real metrics, submit proof, live leaderboard, weekly live calls, streaks & grace), a testimonial, and an FAQ (time/day, missed days, refund, after-30-days). A **sticky bottom enroll bar** (price + closes-in + CTA). Enrolling calls the existing Paystack checkout flow (`/api/funnel/checkout-*` / academy enroll) and, for free challenges, enrolls directly. Reuse `AcademyHero`/enroll patterns already in `academy/page.tsx` and `enroll/[product]`.

#### L2 — Challenge Dashboard  (`/academy/[product]/learn` for a challenge, or a dedicated challenge route; replaces the hardcoded `academy/challenge-30/page.tsx`)
- Greeting + "Day 12 of your $0 → $2,500 sprint".
- **Today's task** hero card (accent gradient): day chip + week, big task title, task-type pills, **Start today's task** → L3, points + streak reminder.
- Three stat tiles: **progress ring** (Day N / 30, % complete, days-to-graduate), **streak** (flame, grace days left), **points + rank** (link to leaderboard).
- **Revenue reported** widget: $ progress toward $2,500 with a "+ Log revenue" action.
- **This week** list: each day row (done = green check + points, today = accent, locked = lock icon), task-type labels; clicking an available day → L3.
- **Package offer** teaser (amber) when auto-advance has unlocked it (discount + countdown).
- Replace the existing bespoke `challenge-30` funnel-state logic with this; keep its `funnel_states`/bundle-offer concepts (they map to the package auto-advance).

#### L3 — Day / Task view  (`/academy/[product]/learn/[day]` or `?day=N`)
Back link → day header (day chip + week, title, **+N pts** reward) → intro line → one **task card per task type**, each with its color, label, title, and a **type-specific body**:
- **lesson**: video player (reuse Mux player from `learn/[lessonId]`).
- **proof**: drag-drop dropzone (image/file/link) + a note field; submits a `AcademyChallengeTaskCompletion` with proof.
- **metric**: a ring showing progress (e.g. 16/20) **auto-tracked from the Leadash outbox** + progress bar; completes automatically at target.
- **self_check**: a checkbox row ("I completed this…").
- **live**: session card with time + **Join** (reuse `AcademyLiveSession.join_url`).
- **quiz**: existing quiz flow.
A footer **Mark day complete** awards points, extends the streak (toast: "+N points · 🔥 streak"), and unlocks the next day per drip.

#### L4 — Leaderboard  (`/academy/[product]/leaderboard`)
Header (cohort + challenger count) + scope select (This week / All-time). A segmented **Points / Earnings** toggle. Earnings board shows a verified-revenue note. **Podium** for top 3 (2-1-3 with medals, crown on 1st), then a ranked list (rank, avatar, name, day + streak, value); the current user's row is accent-highlighted. A prize callout (1st wins the Academy Package). Two queries as described in Data model §4.

---

## Suggested API surface (extend existing `/api/admin/academy/**` and `/api/academy/**`)
- `GET/PATCH /api/admin/academy/products` — already exists; add `product_type` + challenge config.
- `…/challenge-tasks` (CRUD, per day) and reorder.
- `…/challenge/analytics?product_id=&cohort_id=` — tiles, retention array, participants.
- `…/challenge/winners` (auto-pick / set).
- Learner: `GET /api/academy/challenge?product_id=` (days + my progress + streak + offer state), `POST …/task-completion`, `POST …/report-earnings`, `GET …/leaderboard?product_id=&board=points|earnings&scope=`.
- Reminders fire via the existing worker/postal-agent apps (email) + WhatsApp.

## Edge cases to honor
- **Missed days**: grace days absorb up to N misses before a streak resets; catch-up lets past days be completed late (points yes; streak restore configurable).
- **Rolling vs fixed cohorts**: unlock math differs (`days_after_enrollment` vs `days_after_cohort_start`) — already in `isLessonUnlocked()`.
- **Refunds**: within the 7-day window revoke access and remove from leaderboard.
- **Earnings integrity**: when `earnings_require_proof`, unverified reports don't rank.
- **Auto-advance offer**: one-time, time-boxed (countdown), targets the package product with a challenger discount.
- **Free challenges**: skip checkout; still enroll, drip, and rank.

## Files to touch (anchors)
- `apps/web/src/types/academy.ts` — extend types.
- `apps/web/src/app/(admin)/admin/academy/page.tsx` (+ its editors `LessonContentEditor`, `CourseBannerEditor`, `SectionSettingsEditor`, `SortableList`, `AcademyDialog`) — add the challenge product type, builder tabs, schedule/task editors, analytics, funnel map.
- `apps/web/src/app/(app)/academy/**` — challenge sales, dashboard, day, leaderboard; replace the hardcoded `academy/challenge-30/page.tsx`.
- `apps/web/src/app/api/admin/academy/**` and `apps/web/src/app/api/academy/**` — new endpoints above.
- `apps/web/src/v2-app/v2-app.css` — reuse tokens; no new color system.

## How to use this handoff with Claude Code
Unzip into the `leadash` repo, then prompt Claude Code:
> Implement the Academy Challenges design in `handoff_academy_challenges/README.md`. Challenges are a new `product_type` on `AcademyProduct` living in the existing Academy admin (`/admin/academy`) and learner area (`/academy`). Reuse the `v2-app` tokens, the `@hugeicons` icon set, the existing academy editors and data/endpoints, and the Mux/Paystack/cohort plumbing. Open `handoff_academy_challenges/Academy Challenges.dc.html` in a browser for the visual reference, but recreate the UI in our React/TS/Tailwind conventions — don't copy its markup.
