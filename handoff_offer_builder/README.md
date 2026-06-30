# Handoff: Offer Builder

## Overview
The **Offer Builder** lets an admin compose a sellable **offer** from a stack of **grants** (the things a customer receives), set a **pricing model**, design a **checkout page**, and get a shareable checkout link that works standalone or as a paid step in a funnel. It generalizes the existing hardcoded "funnel bundle" (`/api/funnel/checkout-bundle`) into a reusable, admin-configurable system.

An **offer = grants + pricing + checkout page + promotion + fulfillment rules.** Example: *The $10k Academy Bundle* = Growth plan (12 months) + 20 inboxes (free 12 months) + private community — sold one-time at ₦250,000.

This package designs **both sides**:
- **Admin** (`/admin` monetization area): Offer Library, Offer Builder (7 tabs), Offer Analytics.
- **Buyer** (public): the checkout page and the post-purchase confirmation.

## About the design file
`Offer Builder.dc.html` is a **working interactive reference** — open it in a browser; use the floating **Admin ⇄ Buyer** switcher to move between all surfaces. The order-bump toggle and coupon field on the buyer checkout are live (they recompute the total). It was authored in a small self-contained runtime that renders via `React.createElement`, so **don't copy its markup** — recreate each screen in the app's real Next.js/React/TS/Tailwind conventions. All offers/numbers are demo seed data except the structure, which is real.

## Fidelity
High-fidelity. Layout, spacing, color, type and behavior in the prototype are the intended design; express them with the existing token system and components.

## Tech context (match the existing app)
- **Next.js App Router + React + TypeScript + Tailwind v4.**
- Admin surfaces use the **`v2-app` token system** (`apps/web/src/v2-app/v2-app.css`) under `className="v2-app"`, the same approach as `apps/web/src/app/(admin)/admin/academy/page.tsx` (reuse its `.ac-input/.ac-select/.ac-card/.ac-table/.ac-chip` helper pattern).
- Icons: **`@hugeicons/react`** (`HugeiconsIcon` + `@hugeicons/core-free-icons`). The prototype's inline-SVG paths are only a visual guide.
- Money: `formatNgn()` from `@/types/academy` (or the billing equivalent) for ₦. Multi-currency: Nigerian buyers pay ₦ via Paystack; international buyers see $ (the prototype uses ₦1,500 ≈ $1 — wire to your real FX source).
- Checkout uses the existing **Paystack** flow. Study `apps/web/src/app/api/funnel/checkout-bundle/route.ts` and `apps/web/src/app/api/billing/checkout/*` — the offer builder produces the same kind of typed Paystack metadata, just assembled from a stored offer rather than hardcoded.

## Design tokens (from `v2-app.css` — use the `var()` names)
- Surfaces: `--app-bg` `#07070A` · `--app-bg-elevated` `#0E0E13` · `--app-bg-sunken` `#050507` · `--app-surface` / `--app-surface-strong`.
- Borders: `--app-border` · `--app-border-strong`. Text: `--app-text` `#F5F5F7` · `--app-text-muted` `#9A9AA8` · `--app-text-quiet` `#5B5B68` · `--app-text-faint` `#2A2A33`.
- Accent `--app-accent` `#F97316` (+ soft/line). Status: success `#34D399` · warning `#FBBF24` · danger `#F87171` · info `#60A5FA`. Radii sm 6 / 8 / lg 12 / pill 999. Mono for all numerics.
- **Per-grant accent colors** (used consistently across builder, summary, checkout, confirmation): plan `#60A5FA` · inbox `#F97316` · lead credits `#A78BFA` · community `#34D399` · academy `#F472B6` · dedicated IP `#22D3EE` · seats `#FBBF24` · custom `#9A9AA8`.

---

## Data model

### `Offer`
```
Offer {
  id, slug,                       // slug → public URL /o/<slug>
  name, status: "draft"|"active"|"paused",
  // pricing
  pricing_model: "one_time" | "recurring" | "trial" | "free" | "payment_plan" | "pwyw",
  price_ngn, compare_at_ngn?,     // compare-at drives the "save X" badge
  currency_mode: "auto" | "ngn_only" | "usd_only",
  interval?: "monthly"|"quarterly"|"annual",   // recurring/trial
  trial_days?, installments?: { count, amount_ngn },   // trial / payment_plan
  pwyw_min_ngn?,
  // composition
  grants: OfferGrant[],
  bumps: OfferBump[],             // order bumps (checkout)
  upsell?: OfferUpsell, downsell?: OfferUpsell,   // post-purchase
  // checkout page
  checkout: { headline, subhead, badge, layout: "two_col"|"single"|"long",
              show_value_stack, show_countdown, show_testimonials, show_guarantee,
              fields: BuyerField[] },
  // promotion
  discount_codes: DiscountCode[],
  expires_at?, on_expire: "hide_button"|"waitlist"|"full_price",
  stock_limit?,                   // null = unlimited
  recover_abandoned: boolean,
  // fulfillment
  auto_grant: boolean, manual_approval: boolean,
  no_workspace_action: "create"|"invite"|"attach_by_email",
  after_purchase: "confirmation"|"custom_url"|"dashboard", custom_url?,
  send_receipt, send_whatsapp, notify_admin,
  refund_window_days: 0|7|14|30,
  funnel_ids: string[],           // funnels this offer is the paid step in
  created_at, updated_at,
}
```

### `OfferGrant` (the core — a discriminated union by `type`)
Each grant maps to an **existing entitlement/fulfillment path**, so the webhook just iterates `grants` and calls the right granter:
```
type "plan"      { tier: "starter"|"growth"|"scale", months: int }      → set/extend subscription tier for N months
type "inbox"     { qty: int, free_months: int, after: "bill"|"free"|"cancel" }  → workspace_entitlements.inbox_credit (+ free window)
type "credits"   { qty: int, recurring: bool }                          → lead-credit grant (one-time or monthly)
type "community" { invite_url }                                         → send invite (WhatsApp/group link)
type "academy"   { product_id }                                        → AcademyEnrollment (reuse academy enroll)
type "ip"        {}                                                     → provision dedicated sending IP
type "seats"     { qty: int }                                          → add seats to workspace
type "custom"    { label, description }                                 → manual perk; flagged for admin fulfillment
```
> These mirror what `checkout-bundle/route.ts` already grants on the Paystack `charge.success` webhook — generalize that handler to loop over `offer.grants` instead of a fixed bundle.

### Supporting
```
OfferBump   { id, grant: OfferGrant, label, price_ngn, recurring }
OfferUpsell { id, label, description, price_ngn, grant?: OfferGrant, kind: "upsell"|"downsell" }
BuyerField  { key, label, enabled, required, type: "text"|"email"|"tel"|"select" }
DiscountCode{ code, kind: "percent"|"fixed", value, max_redemptions?, manual_only, active, redemptions }
OfferPurchase { id, offer_id, buyer:{name,email,phone}, line_items, discount_code?, subtotal, total, currency,
                paystack_ref, status: "pending"|"paid"|"refunded", granted_at?, created_at }
```

---

## Screens

### ADMIN

#### A1 — Offer Library
Rollup tiles (total revenue, offers live, total sales, avg conversion, active funnels) + a table: each row = icon, name, grant-pills, views, sales (+CR), revenue, status chip → row click opens the Builder. Header: search, status filter, **New offer**. Seed with: $10k Academy Bundle, "10 Inboxes — 3 Months Free", "5,000 Lead Credits Top-up", "Free Outreach Course Opt-in" (₦0), the 30-Day Challenge, a Dedicated-IP add-on (draft, recurring), and a "Scale Plan — 7-Day Trial" (paused).

#### A2 — Offer Builder (tabbed, with a sticky live **Offer summary** rail showing price, grant list, total value & savings)
- **What's included** — the **grant stack**: list of grant cards (drag to reorder, per-type inline controls — e.g. plan tier+months, inbox qty+free-months+billing-after, credits qty+recurring, seats qty, community invite URL, academy product picker, custom perk text), plus an **add-grant** picker (8 types). Each grant shows an "Auto-fulfilled" chip.
- **Pricing** — 6 model cards (one-time, subscription, trial→paid, free, payment plan, PWYW); price + compare-at, billing interval, currency mode; a multi-currency note; conditional trial/installment fields.
- **Checkout page** — content (headline/subhead/badge), layout (two-col/single/long-form), trust toggles (value stack, countdown, testimonials, guarantee), and **buyer fields** (toggle/require/add custom) — with a **live preview** of the payment card on the right.
- **Bumps & Upsells** — order bump(s) shown at checkout; one-click upsell + downsell after purchase.
- **Promotion** — discount codes (percent/fixed/manual), expiring offer + countdown (with close date + on-expire behavior), stock/seat limit, abandoned-checkout recovery.
- **Sharing & Funnel** — public checkout link (`/o/<slug>`), pre-filled contact link (`?c={contact_id}`), embed snippet, funnels this offer is used in (+ add to funnel), QR & social card.
- **Settings** — fulfillment (auto-grant / manual approval / no-workspace behavior), after-purchase (redirect, receipt, WhatsApp, admin notify), refunds (window + auto-revoke note), and pause/duplicate/delete.

#### A3 — Offer Analytics
Tiles (revenue, sales, checkout views, conversion, refund rate), a revenue trend chart, a **checkout funnel** (views → started → added payment → purchased), **revenue by grant** (base + bumps + upsells), and **discount-code performance**.

### BUYER

#### B1 — Checkout page (public, live)
Two-column: left = badge, headline, subhead, **value stack** of grants (each with a check), guarantee + secure-payment trust, social proof. Right = sticky payment card with countdown, price + compare-at + savings, buyer fields, **order-bump checkbox** (toggles total), **discount-code** field (applies → recomputes), itemized totals, and a **Complete purchase** button that initiates Paystack and on success advances to confirmation. Supports ₦/$ display.

#### B2 — Confirmation (post-purchase)
Success state: each granted item listed with an **Active** badge (including any added bump), receipt/order number, next-step cards (join community, go to dashboard), and an "Enter Leadash" CTA. (The one-click upsell from A2, if enabled, is shown *before* this — no card re-entry.)

---

## Suggested API surface
- `GET/POST/PATCH /api/admin/offers` (+ `/[id]`) — CRUD, publish/pause/duplicate.
- `GET /api/offers/[slug]` — public offer for the checkout page (respects expiry/stock).
- `POST /api/offers/[slug]/checkout` — validate fields + discount + bumps, init Paystack, create `OfferPurchase(pending)`.
- Paystack webhook (extend `checkout-bundle`): on `charge.success`, load the purchase's offer, **iterate `grants`** (+ bumps/upsell) and fulfill each via its existing granter; mark `paid` + `granted_at`; fire receipt/WhatsApp/admin-notify; on refund within window, **revoke** each entitlement.
- `POST /api/offers/[slug]/upsell` — accept/decline one-click post-purchase upsell (reuse stored Paystack auth).
- Abandoned recovery + reminders via the existing worker/postal apps.

## Edge cases to honor
- **Free offers (₦0)** skip Paystack — create the purchase and grant immediately (lead magnet).
- **Trial → paid** creates a subscription that bills after `trial_days`; **payment plan** splits into `installments`.
- **Multi-currency**: charge currency follows `currency_mode` / buyer location.
- **Discounts**: percent/fixed, optional max redemptions, manual-only codes (e.g. VIP 100%).
- **Expiry/stock**: past `expires_at` or `stock_limit` reached → apply `on_expire` / show "X left" then close.
- **No workspace**: create-and-invite / invite / attach-by-email per `no_workspace_action`.
- **Refunds** auto-revoke all granted entitlements (plan months, inbox credits, community, academy, seats, IP).
- **Manual approval**: hold fulfillment until an admin approves; `custom` grants always flag for manual fulfillment.

## Files to touch (anchors)
- New types: `apps/web/src/types/offers.ts` (the model above).
- New admin area: `apps/web/src/app/(admin)/admin/offers/**` (library, `[id]` builder, `[id]/analytics`) — reuse the academy admin's `v2-app` styling helpers, `SortableList` (grant reorder), `AcademyDialog`.
- New public routes: `apps/web/src/app/(public)/o/[slug]/page.tsx` (checkout) + `…/success`.
- New API: `apps/web/src/app/api/admin/offers/**` and `apps/web/src/app/api/offers/**`.
- **Generalize**: `apps/web/src/app/api/funnel/checkout-bundle/route.ts` → an offer-driven checkout + a webhook granter that loops `offer.grants`. Reuse the inbox-credit (`workspace_entitlements`), lead-credit, community-invite, and academy-enroll granters that already exist.

## How to use this handoff with Claude Code
Unzip into the `leadash` repo, then prompt Claude Code:
> Implement the Offer Builder in `handoff_offer_builder/README.md`. An offer is a stack of composable **grants** + a pricing model + a checkout page, sold via Paystack and usable standalone or in a funnel. Generalize the existing `api/funnel/checkout-bundle` route and its webhook granter to be offer-driven (loop over `offer.grants`), reusing the inbox-credit / lead-credit / community / academy / seats / plan fulfillment paths we already have. Build the admin area under `/admin/offers` with the `v2-app` tokens and `@hugeicons`, and the public checkout under `/o/[slug]`. Open `handoff_offer_builder/Offer Builder.dc.html` in a browser for the visual reference, but recreate the UI in our React/TS/Tailwind conventions — don't copy its markup.
