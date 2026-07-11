# Handoff: ICPs & Offers + Affiliate Program

Two features in one package. Both designed against the `v2-app` dark token system and the existing app structure.

1. **ICPs & Offers** — a new "ICPs & Offers" tab under Outreach (next to CRM) where users save Ideal Customer Profiles and Offer templates once, then select them in the AI sequence generator so it writes on-target sequences without re-typing product details per campaign.
2. **Affiliate Program** — every user is automatically an affiliate: referral link, tiered recurring commissions, cash (Leadash Pay) or subscription-credit payouts, plus an admin console with a payout queue and fraud review.

## About the design file
`ICPs Offers Affiliates.dc.html` is a working interactive reference — open it in a browser and use the floating **ICPs & Offers ⇄ Affiliates** switcher to see all six screens. The ICP/Offer pickers, "what the AI sees" panel, generate flow, payout-method choice, and admin tabs are live. It renders via `React.createElement` in a self-contained runtime — **do not copy its markup**; recreate in the app's real Next.js/React/TS/Tailwind conventions. Seed data is demo.

## Fidelity
High-fidelity: layout, spacing, color, type, and interaction behavior are the intended design.

## Tech context (match the existing app)
- **Next.js App Router + React + TS + Tailwind v4**, `v2-app` tokens (`apps/web/src/v2-app/v2-app.css`); user-facing pages follow the conventions of the surrounding `(app)` pages (`.v2-app` wrapper + `var(--app-*)` + Tailwind `white/x` utilities). Admin pages follow `(admin)/admin/academy/page.tsx`'s helper-class pattern.
- Icons: `@hugeicons/react`. Money: ₦ via the existing formatter; mono font for numerics.
- Key integration points, all existing:
  - **Nav**: `apps/web/src/lib/nav/sections.ts` — add `{ href: "/playbook", label: "ICPs & Offers", badge: "New" }` to the `outreach` section's `tabs` after CRM. (Route name yours to choose; prototype uses "ICPs & Offers" as the label.)
  - **AI generator**: `apps/web/src/app/(app)/campaigns/new/CampaignWizardClient.tsx` — the current modal collects `aiProduct/aiAudience/aiValueProp/aiTone/aiNumEmails/aiWaitDays/aiMessageLength` as free text and calls `generateSequence()` (`@/lib/outreach/api`). Replace the free-text trio with ICP + Offer pickers (fetching saved records) and pass a compiled context object to the generation endpoint.
  - **Payout rails**: Leadash Pay (`/leadpay/payouts`) for affiliate cash payouts; billing/entitlements for subscription-credit payouts.
  - **Referral attribution**: signup flow + Paystack webhook (commission on `charge.success`).

## Design tokens
Same as prior handoffs: `--app-bg #07070A`, `--app-bg-elevated #0E0E13`, `--app-bg-sunken #050507`, borders at .06/.10 white, text `#F5F5F7`/`#9A9AA8`/`#5B5B68`, accent `#F97316`, success `#34D399`, warning `#FBBF24`, danger `#F87171`, info `#60A5FA`, violet `#A78BFA` (AI accent). Radii 6/8/12/999.

---

# Feature 1 — ICPs & Offers

## Data model
```
Icp {
  id, workspace_id, name,
  industry, company_size, geography, roles,        // basics
  pains: string[], goals: string[],                // pains & goals
  triggers: string[], objections: string[],        // buying triggers & objections
  tone: string,                                    // voice/language guidance
  linked_list_ids: string[],                       // lead lists auto-matched to this ICP
  created_at, updated_at
}
OfferTemplate {                                    // NOT the sellable Offer Builder offer —
  id, workspace_id, name,                          // this is messaging material for sequences
  price_label, what, value_prop,
  proof, guarantee?, case_snippets: string[],
  cta_kind: "book_call"|"reply"|"link", cta_label,
  linked_checkout_offer_id?,                       // optional link to a sellable offer (Offer Builder) so sequences can insert a real checkout URL
  created_at, updated_at
}
```
Track usage: campaigns store `icp_id` / `offer_template_id` when generated from them, so the library can show "used in N campaigns" and post-hoc reply-rate lift per ICP.

## Screens

### 1. Library (`/playbook`, Outreach tab bar: Sequences · Inboxes · Leads Pool · CRM · **ICPs & Offers**)
- Intro strip: "ICPs and Offers power your AI sequences" + a link to try the generator.
- Two card grids: **ICPs** (icon, name, industry · geo, top-2 pain chips, footer: used-in count + reply lift) and **Offers** (icon, name, price, 2-line value prop, footer: used-in + "Linked to checkout" chip when linked). Cards open their editors. "New ICP" / "New offer" buttons in the header.

### 2. ICP editor
Header (colored icon, name, usage stats) + **"Draft with AI"** bar (paste a website/description → AI fills all fields; wire to a new endpoint using the existing AI infra). Sections (cards):
- **Basics** — name, industry, company size, geography, roles.
- **Pains & goals** — tag lists with inline "+ Add".
- **Buying triggers & objections** — tag lists ("the AI pre-empts these in follow-ups").
- **Tone & language** — free text.
- **Linked lead lists** — attach existing lead lists; campaigns using this ICP can auto-enroll matching leads.

### 3. Offer editor
Header + "Draft with AI" (describe roughly → AI structures it). Sections:
- **The offer** — name, price, what it is, one-line value prop.
- **Proof & risk-reversal** — proof/results, guarantee, case-study snippets (tags).
- **Call to action** — 3-way picker (Book a call / Ask for a reply / Send a link) + CTA text.
- **Sell it online** — link a sellable offer from the Offer Builder; when linked, sequences can drop the checkout link automatically.

### 4. Upgraded AI sequence generator (in the campaign wizard, step 3)
Two-column:
- **Left**: ICP radio-card picker (+ "New" → ICP editor), Offer radio-card picker, and Tuning (tone [default "Match ICP tone"], # emails, wait days, "anything else the AI should know" textarea).
- **Right**: **"What the AI sees"** — a live compiled context panel (Audience, Their pains, Objections to pre-empt, Offer, Proof, Guarantee, CTA, Voice) built from the selections; then a violet **Generate sequence** button → the generated sequence preview (email cards + wait rows) with **Save as template** and **Use in campaign** (inserts into the wizard's `seqSteps`).
- API: extend the `generateSequence` payload from `{product_name, target_audience, value_prop, …}` to `{icp_id, offer_template_id, extra_context, tone, num_emails, wait_days_between, message_length}`; the server compiles the same context shown in the panel into the prompt. Keep backward compatibility (free-text path) for users with no saved ICPs.

---

# Feature 2 — Affiliate Program

## Program rules (as designed; all admin-configurable)
- Every user is auto-enrolled; link `leadash.io/r/<handle>`, 30-day cookie.
- **₦5,000 one-time bounty** on a referral's first payment + **recurring commission on every payment for 12 months**.
- **Tiers**: Bronze 20% (0+ paid referrals) → Silver 25% (10+) → Gold 30% + priority payouts (25+).
- Earnings hold **45 days** (refund window) → then "available". **Minimum payout ₦20,000.**
- Payout methods: **cash to bank via Leadash Pay** (1–2 days) or **subscription credit at 1.25×** the cash value.
- Fraud: self-referral detection (same card/device/email cluster) → block + flag; low-quality flag (signups ≫ paid).

## Data model
```
Affiliate       { user_id, handle, tier, clicks, signups, paid_referrals, created_at }
Referral        { id, affiliate_id, referred_user_id, source: cookie|link, first_paid_at?, status: lead|paid|churned|refunded }
CommissionEvent { id, affiliate_id, referral_id, kind: bounty|recurring, amount_ngn,
                  source_payment_ref, holds_until, status: pending|available|paid|reversed }
AffiliatePayout { id, affiliate_id, amount_ngn, method: bank|credit, credit_multiplier?,
                  destination, status: queued|processing|paid|held, fraud_flag?, batch_id?, created_at }
FraudFlag       { id, affiliate_id, kind: self_referral|low_quality|velocity, evidence, status: open|cleared|confirmed }
```
Commission events are written by the Paystack `charge.success` webhook (look up the payer's referral → bounty on first payment, recurring % within the 12-month window). Refund webhook **reverses** matching events.

## Screens

### 5. Affiliate dashboard (user-facing, e.g. `/affiliates` or a Workspace tab)
- Hero: referral link with Copy + QR, tier badge ("Silver · 25%"), progress bar to Gold ("9 paid · Gold at 25 → 30%").
- Four tiles: Available to withdraw (green, "after 45-day hold"), Pending (amber), Lifetime earned, Active referrals.
- Left column: **funnel** (clicks → signups → paid, with step-conversion %) and **payout history** (date, method, amount, status chip).
- Right column: **Get paid** — radio choice: Cash to bank (via Leadash Pay) vs Subscription credit (shows the 1.25× math, e.g. ₦48,200 → ₦60,250); the CTA updates accordingly ("Withdraw ₦48,200" / "Convert to ₦60,250 credit"); min-payout + hold note. **How you earn** — 4 numbered steps (link → bounty → recurring % → Gold tier). **Promo assets** — banners, swipe copy, social posts, demo video.

### 6. Affiliate admin (`/admin/affiliates`)
- Header: "Affiliate Program" + Live chip, "Program settings", **Run payouts** (queues a batch via Leadash Pay).
- Five tiles: Affiliates (auto-enrolled count), Revenue driven, Pending liability, Paid out, Fraud flags (red).
- Segmented tabs:
  - **Affiliates** — table: avatar/name (fraud annotation inline in red under the name), clicks, signups, paid, earned (green), pending (amber), tier chip, row action (Review for flagged, chevron otherwise).
  - **Payout queue** — warning banner when flags exist ("1 payout is held…"), "Approve all clean · ₦X" batch button; rows: affiliate, destination (bank ****/credit), amount, Ready/Held chip, Approve or Review.
  - **Program settings** — commission (base %, recurring window, bounty, cookie), tier table (Bronze/Silver/Gold requirements + rates), payouts & safety (min payout, refund hold, credit multiplier, self-referral detection mode).

## Suggested API surface
- `GET/POST/PATCH /api/playbook/icps`, `/api/playbook/offer-templates` (+ AI-draft endpoints: `POST …/draft` with `{url_or_description}`).
- `POST /api/outreach/generate-sequence` — extended payload (above).
- `GET /api/affiliates/me` (stats, link, tier, earnings), `POST /api/affiliates/payout` ({method}), `GET …/payouts`.
- `GET /api/admin/affiliates` (+ `/payouts`, `POST /payouts/approve`, `/flags/:id/resolve`, `GET/PATCH /settings`).
- Attribution: `/r/[handle]` route sets the cookie + logs click → signup ties `referred_by`; webhook writes commission events.

## Edge cases to honor
- ICP/Offer deleted while campaigns reference it → keep a frozen snapshot on the campaign; library shows "archived".
- AI generate with no saved ICPs → offer inline "create your first ICP" or fall back to the legacy free-text fields.
- Affiliate self-referral (same card/email/device) → block commission, raise flag; refunds reverse commissions (never negative balance below zero — clamp and log).
- Credit payouts apply via the existing billing entitlements; cash payouts ride the existing Leadash Pay payout pipeline and inherit its KYC/limits.
- Tier recalculation on each new paid referral; demotion never claws back paid commissions.

## Files to touch (anchors)
- `apps/web/src/lib/nav/sections.ts` — add the Outreach tab.
- New: `apps/web/src/app/(app)/playbook/**` (library + editors), `apps/web/src/app/(app)/affiliates/**` (dashboard), `apps/web/src/app/(admin)/admin/affiliates/**`.
- `apps/web/src/app/(app)/campaigns/new/CampaignWizardClient.tsx` — swap the AI modal internals for ICP/Offer pickers + context preview (keep `generateSequence` flow).
- `apps/web/src/lib/outreach/api.ts` + `/api/outreach/*` — extended generation payload.
- New `/api/playbook/**`, `/api/affiliates/**`, `/api/admin/affiliates/**`; extend the Paystack webhook for commission events.

## How to use this handoff with Claude Code
Unzip into the `leadash` repo, then prompt Claude Code:
> Implement the two features in `handoff_icps_offers_affiliates/README.md`. (1) ICPs & Offers: a new Outreach tab (next to CRM in `lib/nav/sections.ts`) with a library + editors for saved ICPs and Offer templates, and upgrade the AI sequence generator in `CampaignWizardClient.tsx` to use ICP/Offer pickers with a compiled-context preview instead of free-text fields. (2) Affiliate program: auto-enrolled users, tiered recurring commissions written from the Paystack webhook, cash payouts via Leadash Pay or 1.25× subscription credit, user dashboard + admin console with payout queue and fraud flags. Use the `v2-app` tokens and `@hugeicons`. Open `handoff_icps_offers_affiliates/ICPs Offers Affiliates.dc.html` in a browser as the visual reference, but recreate the UI in our React/TS/Tailwind conventions — don't copy its markup.
