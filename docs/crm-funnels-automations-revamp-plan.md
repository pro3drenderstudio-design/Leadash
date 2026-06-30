# CRM · Funnels · Automations — Full Revamp Plan
*Authored 2026-06-24 | Goal: Replace GHL, HubSpot, and every external marketing tool*

---

## Executive Summary

The three systems need to become a unified marketing OS. The current state:
- **CRM** — basic inbox (email + WhatsApp only), no contact profile depth, single-team (Leadash admin only)
- **Funnels** — hardcoded `funnel_states` table for one specific challenge→bundle path. Zero flexibility.
- **Automations** — React Flow builder with 6 node types, confusing `duplicate_policy` labels, no cross-platform triggers

The redesign should make Leadash a complete replacement for GHL at 1/10th the cost, with superior data since we already own the leads, outreach, billing, and academy in one place.

---

## PART 1 — CRM: Unified Omnichannel Inbox

### 1.1 Current gaps
The schema (`049_crm.sql`) is well-structured for email + WhatsApp but:
- Only two channels supported (email, whatsapp enum constraint)
- `crm_contacts` has no custom fields, no lifecycle stage, no deal/pipeline tracking
- No team management (the admin CRM is single-team Leadash-internal)
- No identity resolution (same person on WhatsApp + email = two contacts, no merge)
- No AI features
- No per-contact activity timeline (cross-system events)
- No CSAT / satisfaction tracking
- No SLA / first-response tracking
- The contact profile panel doesn't exist — conversations have no sidebar

### 1.2 Channel additions

**Priority order:** Instagram DM → SMS → Facebook Messenger → Live chat widget → LinkedIn DM

Each channel has unique constraints:

| Channel | Window rule | Media | Limitations |
|---------|------------|-------|-------------|
| Email | None | Attachments | Threading via Message-ID headers |
| WhatsApp | 24h from last inbound | Image, video, audio, doc, buttons, lists | Template-only after window |
| Instagram DM | 24h from last inbound | Image, video, voice, sticker | Can't send clickable links |
| Facebook Messenger | 24h from last inbound | Image, video, audio, buttons, carousels | Page-specific, token expiry |
| SMS | None | MMS optional | Character limits, carrier filtering |
| Live chat | None | File upload | Requires JS snippet on external site |

**Critical edge cases per channel:**

*Instagram:*
- Story mention → starts a conversation (user mentioned your story = high-intent signal)
- `instagram_scoped_id` per page — same user has different ID on different IG accounts
- Link sharing disabled in DMs — render URLs as plain text with copy button
- Media URLs expire after 24h → download and store in Supabase Storage immediately on receive

*Facebook Messenger:*
- Page Access Token expires unless you set `long_lived_token` → need token refresh cron
- Same user can have multiple conversations (different pages)
- "Send to Messenger" checkbox widget → separate opt-in flow
- Conversation type: `UPDATE`, `MESSAGE_TAG`, `RESPONSE` — must use correct type after 24h

*Instagram + Facebook both use Meta Graph API:*
- Single webhook endpoint for both — differentiate by `object: "instagram"` vs `"page"`
- Webhook verification same pattern (`hub.verify_token`)
- Rate limits: 200 calls/hour per user token — need aggressive caching

### 1.3 Contact identity resolution

The hardest CRM problem. Design:

1. **Auto-link on known identifiers:** When inbound message arrives from `+234-xxx`, if a `crm_contacts` row with that phone exists → link automatically. Same for email.
2. **AI-assisted merge suggestions:** Nightly job: find contacts with same name + overlapping signals → create `crm_merge_suggestions` with confidence score. Admin reviews in a "Potential Duplicates" panel.
3. **Manual merge:** Admin selects two contacts → merge. Source contact data kept as backup. All conversations, notes, tasks re-pointed to target contact.
4. **Edge case — shared phone:** Two people sharing +234-XXX (family business). Don't auto-merge. Show warning: "This number matches Contact X. Link or create new?" The admin decides.
5. **Edge case — same email, different companies:** Jane Smith changes jobs, same Gmail. Show flag: "Same email as existing contact Jane Smith at OldCorp." Admin can merge or create separate.
6. **Linked Leadash workspace:** If `crm_contacts.workspace_id` is set → contact panel shows live workspace data: plan, credit balance, active campaigns, last login, inbox count. Clickable → opens workspace detail modal.

### 1.4 Contact profile sidebar (right panel in conversation view)

Every open conversation shows a right sidebar with:

```
┌─────────────────────────────┐
│  [Avatar] Jane Smith        │
│  jane@example.com · +234... │
│  [Lead] [Customer] [VIP]    │ ← lifecycle stage + tags
├─────────────────────────────┤
│  WORKSPACE                  │
│  Acme Corp (Pro plan)       │
│  ₦50k credits · 3 inboxes  │
│  Last login: 2h ago         │ ← click → workspace modal
├─────────────────────────────┤
│  CHANNELS                   │
│  ✉ 3 email threads          │
│  💬 Active WA (window open) │
│  📱 Instagram (2h ago)      │ ← cross-channel presence
├─────────────────────────────┤
│  FUNNEL JOURNEY             │
│  Joined via /free-training  │
│  ✓ Purchased Challenge      │
│  ✓ Day 1 complete           │
│  ✗ Bundle not purchased     │ ← funnel progress
├─────────────────────────────┤
│  ACTIVITY TIMELINE          │
│  2h ago  — sent WhatsApp    │
│  1d ago  — email opened     │
│  3d ago  — signed up        │
│  [see all...]               │
├─────────────────────────────┤
│  CUSTOM FIELDS              │
│  Industry: FinTech          │
│  Company size: 11-50        │
│  [+ Add field]              │
├─────────────────────────────┤
│  TASKS                      │
│  □ Follow up re: pricing    │
│    Due tomorrow · @Malik    │
│  [+ Add task]               │
└─────────────────────────────┘
```

### 1.5 Team collaboration features

- **Assignment:** Assign conversation to any admin user. Assignee gets in-app + email notification.
- **Agent collision detection:** When two admins have the same conversation open, show "Sarah is also viewing" banner + "Sarah is typing..." if she's composing. Use Supabase Realtime for this.
- **@mentions in notes:** `@Malik check this customer's invoice` → Malik gets notified
- **Draft persistence:** Draft messages auto-saved per (conversation, agent) pair. Coming back after 30min shows "You have a draft."
- **Bulk actions:** Select 20 conversations → Assign all, Resolve all, Add tag all, Export all

### 1.6 AI features in CRM

- **Sentiment analysis:** Classify each inbound message as positive/neutral/negative. Show color dot in conversation list. Flag high-frustration conversations for priority handling.
- **Auto-categorize:** `support` | `billing` | `sales` | `general`. Used to route/assign automatically.
- **Reply suggestions:** Based on conversation history + knowledge base → suggest 3 short replies. One-click insert.
- **Conversation summary:** "Summarize this thread" button → Claude-haiku generates 3-bullet summary.
- **Smart reply templates:** When you start typing, suggest existing canned responses that match.

### 1.7 CRM Settings page (new `/admin/crm-settings`)

Sections:
1. **Channels** — Connect/disconnect Instagram, Facebook, SMS. Show token status, expiry.
2. **Inboxes** — Which email addresses forward to CRM (Postal inbound routes). WhatsApp business number.
3. **Team** — Add/remove agents who can access CRM. Set default assignment rules.
4. **Assignment Rules** — If channel = WhatsApp AND tag contains VIP → assign to Malik. Rule engine.
5. **Business Hours** — Set timezone + working hours. Outside hours → auto-reply with "We'll get back to you by [next business day]."
6. **SLA** — First response target (e.g., 2 hours). Conversations breaching SLA get flagged red.
7. **Canned Responses** — Library of quick-reply templates by category.
8. **Custom Fields** — Define additional contact fields (text, number, date, dropdown).
9. **Tags** — Manage tag list with colors.
10. **CSAT** — Enable satisfaction survey after resolution. Choose: "Did we resolve your issue? 👍👎" or star rating.

### 1.8 CRM Reporting (new `/admin/crm-reports`)

- First response time (avg, median, by agent)
- Resolution time (avg by channel)
- Volume by channel, by hour-of-day, by day-of-week
- CSAT scores over time
- Agent performance: conversations handled, avg resolution time, CSAT
- Tag distribution (what are customers talking about?)

### 1.9 Schema additions needed

```sql
-- Extend channel check to support all channels
ALTER TABLE crm_conversations DROP CONSTRAINT ...; -- drop channel check
ALTER TABLE crm_conversations ADD CONSTRAINT crm_conversations_channel_check
  CHECK (channel IN ('email','whatsapp','instagram','facebook','sms','chat'));

-- Add to crm_contacts
ALTER TABLE crm_contacts
  ADD COLUMN instagram_id      text,
  ADD COLUMN facebook_id       text,
  ADD COLUMN lifecycle_stage   text DEFAULT 'lead'
    CHECK (lifecycle_stage IN ('lead','prospect','customer','churned','blocked')),
  ADD COLUMN custom_fields     jsonb DEFAULT '{}',
  ADD COLUMN source            text, -- 'funnel', 'whatsapp', 'email', 'manual', 'import'
  ADD COLUMN source_funnel_id  uuid REFERENCES funnels(id) ON DELETE SET NULL;

-- Contact merge history
CREATE TABLE crm_contact_merges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id      uuid NOT NULL REFERENCES crm_contacts(id),
  source_id      uuid NOT NULL, -- soft ref, source row deleted after merge
  merged_by      uuid REFERENCES auth.users(id),
  merged_at      timestamptz DEFAULT now()
);

-- Merge suggestions (AI-generated nightly)
CREATE TABLE crm_merge_suggestions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_a    uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  contact_b    uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  confidence   int NOT NULL, -- 0-100
  reason       text, -- 'same_phone', 'same_name_email_domain', etc.
  status       text DEFAULT 'pending' CHECK (status IN ('pending','merged','dismissed')),
  created_at   timestamptz DEFAULT now()
);

-- Tasks
CREATE TABLE crm_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES crm_conversations(id) ON DELETE SET NULL,
  assigned_to     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text NOT NULL,
  due_at          timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- Channel settings per channel type
CREATE TABLE crm_channel_configs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel      text NOT NULL CHECK (channel IN ('instagram','facebook','sms')),
  credentials  jsonb NOT NULL DEFAULT '{}', -- encrypted tokens
  config       jsonb NOT NULL DEFAULT '{}', -- page_id, webhook_verify_token, etc.
  status       text DEFAULT 'connected' CHECK (status IN ('connected','error','disconnected')),
  token_expires_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(channel)
);

-- SLA breach tracking
ALTER TABLE crm_conversations
  ADD COLUMN first_response_at  timestamptz,
  ADD COLUMN resolved_at        timestamptz,
  ADD COLUMN sla_breached_at    timestamptz;

-- Agent typing / presence (ephemeral — no persistent storage, use Realtime channels)
-- Realtime presence via Supabase Broadcast: channel = `crm:conversation:${id}`
```

---

## PART 2 — Funnels: Flexible Page Builder

### 2.1 What exists vs what's needed

Currently: `funnel_states` tracks progress through ONE hardcoded funnel (free-training → challenge → bundle). Any new funnel = new code. This must change.

**Target architecture (GHL-style but better):**
```
Funnel
  └── Page 1 (Landing)        → slug: /leadash-academy
  └── Page 2 (Optin)          → slug: /leadash-academy/register
  └── Page 3 (Order)          → slug: /leadash-academy/checkout
  └── Page 4 (OTO)            → slug: /leadash-academy/special-offer
  └── Page 5 (Thank You)      → slug: /leadash-academy/welcome
```

Each funnel page is a fully editable block-based page.

### 2.2 Page builder blocks

**Layout blocks:**
- Section (full-width container with background: color, image, video, gradient)
- 2-column, 3-column grid
- Spacer / Divider

**Content blocks:**
- Headline (H1/H2/H3, custom font, size, color, alignment)
- Body text (rich text editor)
- Image (with link, alt text, lazy load)
- Video (YouTube / Vimeo embed, native MP4, autoplay options)
- Button (primary/secondary, link/form submit/scroll-to, custom colors)
- List (bullet, numbered, icon-prefixed)
- Icon
- Badge / pill label

**Marketing blocks:**
- Hero section (headline + subtext + CTA + background image/video)
- Countdown timer (fixed deadline vs evergreen-per-visitor reset)
- Progress bar (custom label and percentage)
- Social proof counter ("1,247 students enrolled")
- Testimonial card / testimonial carousel
- Pricing table (compare plans)
- FAQ accordion
- Feature grid (icon + title + text)
- Logo grid (brand trust logos)
- Stats bar ("₦50M in leads generated · 2,400 users · 99.9% uptime")

**Interactive blocks:**
- Optin form (email + optional fields, connects to CRM contact creation)
- Multi-step form wizard
- Survey / quiz (conditional logic)
- Booking widget (Calendly embed)
- Custom HTML/CSS block (for advanced users)
- Chat bubble (trigger CRM live chat)
- Popups (exit-intent, timed, scroll-depth triggered)

**Personalization tokens** (available in all text blocks):
- `{{first_name}}`, `{{last_name}}`, `{{email}}`, `{{company}}`
- `{{utm_source}}`, `{{utm_campaign}}`
- `{{days_remaining}}` (countdown-aware)

### 2.3 A/B Testing — properly

Current problem: A/B testing is not implemented at all. Design:

1. **Variants:** Create up to 4 variants per page (A, B, C, D)
2. **Traffic split:** Drag to set percentages (visual slider). Must sum to 100%.
3. **Visitor stickiness:** Variant assigned by hashing `session_id + page_id`. Same visitor always sees same variant. Survives across page refreshes and revisits within 30 days (localStorage + cookie).
4. **Goal tracking:** Conversion = reached next funnel page (primary). Secondary: form submission, button click, scroll depth ≥ 80%.
5. **Statistical significance:** Show sample size, conversion rate per variant, and significance badge. Use a Bayesian or chi-squared test server-side. Only declare winner when p < 0.05 AND minimum 100 conversions per variant.
6. **Auto-winner:** Optional: when significance reached → automatically route 100% traffic to winner and notify admin.
7. **Edge cases:**
   - Variant B's page is unpublished mid-test → re-assign its traffic to A immediately
   - If conversion rate is 0% for both after 1,000 visitors → flag as "likely broken"
   - Pausing test mid-run: visitors already assigned keep their variant. New visitors split normally when resumed.

### 2.4 Funnel connections

When a page contains a purchase/optin action, connect it to:
- **Paystack checkout** — link to specific `plan_id` or one-time product. Amount is locked server-side (never trust client).
- **Academy enrollment** — on purchase, auto-enroll in challenge/bundle
- **Subscription plan change** — upgrade/downgrade workspace plan
- **Email campaign enrollment** — add to outreach sequence
- **CRM automation trigger** — fire "funnel_purchase" automation event
- **External redirect** — for affiliate/partner funnels

**Double-purchase prevention:**
- On checkout load, check if workspace already has this product. If yes → redirect to "You already have access" page.
- Paystack webhook is source of truth for payment (never trust direct success redirect).
- Idempotency key per checkout session prevents webhook double-processing.

### 2.5 Slug management

- Funnel slug: `leadash.com/{funnel-slug}` — must not conflict with existing app routes (`/discover`, `/settings`, etc.)
- Maintain a reserved slugs list. Admin sees a warning if conflict detected.
- Custom domain: `Point yourdomain.com → leadash.com` via CNAME. Store in `funnels.custom_domain`. Auto-provision SSL via Let's Encrypt using Caddy/Nginx config generation on VPS.
- Page slugs must be unique within a funnel (enforced by DB unique constraint).

### 2.6 Funnel analytics

Per-page metrics visible in funnel view:
- Unique visitors (session-based, deduped)
- Conversion rate (% who reached next step)
- Drop-off rate
- Avg time on page
- Device breakdown (mobile/desktop/tablet)
- Revenue attributed (for order pages)
- UTM source breakdown

Funnel-level view:
- Sankey/flow diagram showing drop-off between steps
- Total revenue
- Cost per conversion (if ad spend manually entered)

### 2.7 Schema additions

```sql
-- The master funnel container
CREATE TABLE funnels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  custom_domain text,
  status       text DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  global_styles jsonb DEFAULT '{}', -- brand colors, fonts, button style
  settings     jsonb DEFAULT '{}', -- favicon, meta defaults, scripts, noindex
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now()
);

-- Pages within a funnel
CREATE TABLE funnel_pages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id    uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  name         text NOT NULL,
  slug         text NOT NULL,
  step_order   int NOT NULL,
  page_type    text DEFAULT 'landing'
    CHECK (page_type IN ('landing','optin','sales','order','oto','downsell','thankyou','webinar','survey')),
  status       text DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  blocks       jsonb DEFAULT '[]', -- block tree
  settings     jsonb DEFAULT '{}', -- SEO title, og image, scripts, background, popup config
  connection   jsonb, -- { type: 'paystack'|'academy'|'plan'|'redirect', ...details }
  published_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(funnel_id, slug)
);

-- Version history for pages (undo/rollback)
CREATE TABLE funnel_page_versions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id   uuid NOT NULL REFERENCES funnel_pages(id) ON DELETE CASCADE,
  version   int NOT NULL,
  blocks    jsonb NOT NULL,
  settings  jsonb NOT NULL,
  saved_by  uuid REFERENCES auth.users(id),
  saved_at  timestamptz DEFAULT now(),
  UNIQUE(page_id, version)
);

-- A/B tests (one test per page = page is the control)
CREATE TABLE funnel_ab_tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id        uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  control_page_id  uuid NOT NULL REFERENCES funnel_pages(id),
  name             text NOT NULL,
  status           text DEFAULT 'running' CHECK (status IN ('running','paused','completed')),
  goal_metric      text DEFAULT 'conversion'
    CHECK (goal_metric IN ('conversion','revenue','time_on_page','scroll_depth')),
  auto_winner      boolean DEFAULT false,
  winner_page_id   uuid REFERENCES funnel_pages(id),
  started_at       timestamptz DEFAULT now(),
  ended_at         timestamptz
);

-- Variants for an A/B test
CREATE TABLE funnel_ab_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id         uuid NOT NULL REFERENCES funnel_ab_tests(id) ON DELETE CASCADE,
  page_id         uuid NOT NULL REFERENCES funnel_pages(id),
  traffic_pct     int NOT NULL CHECK (traffic_pct BETWEEN 0 AND 100),
  visitors        int DEFAULT 0,
  conversions     int DEFAULT 0,
  revenue_cents   bigint DEFAULT 0
);

-- Anonymous visitor tracking (pre-contact-creation)
CREATE TABLE funnel_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id  uuid REFERENCES funnels(id) ON DELETE CASCADE,
  session_id text NOT NULL, -- hashed fingerprint
  contact_id uuid REFERENCES crm_contacts(id) ON DELETE SET NULL, -- linked after optin
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term   text,
  referrer   text,
  device     text, -- mobile/desktop/tablet
  country    text,
  created_at timestamptz DEFAULT now()
);

-- Per-page visit events
CREATE TABLE funnel_page_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid REFERENCES funnel_sessions(id) ON DELETE CASCADE,
  page_id     uuid REFERENCES funnel_pages(id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES funnel_ab_variants(id),
  event_type  text NOT NULL CHECK (event_type IN ('view','conversion','button_click','form_submit','exit')),
  metadata    jsonb DEFAULT '{}',
  occurred_at timestamptz DEFAULT now()
);

-- Form submissions
CREATE TABLE funnel_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     uuid REFERENCES funnel_pages(id) ON DELETE CASCADE,
  session_id  uuid REFERENCES funnel_sessions(id),
  contact_id  uuid REFERENCES crm_contacts(id),
  data        jsonb NOT NULL DEFAULT '{}', -- field values
  created_at  timestamptz DEFAULT now()
);
```

---

## PART 3 — Automations: Complete Rebuild

### 3.1 Core philosophy change

Current model: admin-only automation for internal Leadash operations (e.g., send a WhatsApp when a user signs up).

New model: Full event-driven marketing automation that works across ALL systems with a clean, non-confusing UI.

### 3.2 Replace confusing UI labels

The `duplicate_policy` field currently shows "Skip dupe / Parallel / Restart" in the builder. This is confusing.

**Replace with:** In the automation's main settings panel (gear icon):

```
When a contact triggers this automation again while already in it:
  ○ Skip — don't start a new run (most common)
  ○ Restart — cancel current run, start from the beginning
  ○ Continue in parallel — run multiple instances at once (e.g. for recurring billing reminders)
```

Clear description, not technical abbreviations. These are automation-level settings, not node-level.

### 3.3 New trigger registry (exhaustive)

**Category: Funnel**
| Trigger | Configurable options |
|---------|---------------------|
| Funnel page visited | Which funnel / which page / how many times |
| Optin form submitted | Which form / specific field value |
| Funnel purchase completed | Which product / any product |
| OTO accepted | Which OTO page |
| OTO declined | Which OTO page |
| Funnel abandoned | After how many minutes of inactivity |
| AB test variant assigned | Which test / which variant |

**Category: CRM**
| Trigger | Configurable options |
|---------|---------------------|
| Contact created | Source: any / funnel / WhatsApp / import |
| Conversation opened | Channel: any / email / WhatsApp / Instagram |
| Inbound message received | Channel / contains keyword |
| Tag added to contact | Which tag |
| Tag removed from contact | Which tag |
| Contact lifecycle stage changed | From → To |
| Conversation resolved | Any / specific channel |
| Custom field changed | Which field / to what value |

**Category: Email / Outreach**
| Trigger | |
|---------|--|
| Email opened | Campaign / any |
| Link clicked | Campaign / specific link |
| Reply received | Campaign / any |
| Bounced | Hard / soft |
| Unsubscribed | |
| Campaign completed | Enrolled completed all steps |

**Category: Academy**
| Trigger | |
|---------|--|
| Challenge enrolled | |
| Day N completed | Which day (1-30) |
| Challenge completed (all 30 days) | |
| Bundle purchased | |
| Inactivity (no login > N days) | Configurable N |
| Progress milestone | 25% / 50% / 75% complete |

**Category: Billing**
| Trigger | |
|---------|--|
| Subscription started | Plan: any / specific |
| Subscription renewed | |
| Payment failed | Attempt number (1, 2, 3) |
| Plan upgraded | From → To |
| Plan downgraded | From → To |
| Trial started | |
| Trial ending soon | N days before expiry |
| Trial expired (no conversion) | |
| Subscription cancelled | |
| Invoice generated | Amount threshold |
| Grace period started | |

**Category: Schedule**
| Trigger | |
|---------|--|
| Fixed schedule | Cron expression (with visual builder) |
| Delay from signup | N days/hours after workspace created |
| Contact anniversary | 1 year after join date |
| Custom date field | N days before/after a contact's date field |

**Category: Webhook (inbound)**
- External system POSTs to `leadash.com/api/automations/webhook/{secretKey}`
- Payload parsed and mapped to contact by email/phone
- Useful for: Paystack direct, custom integrations

### 3.4 New action registry (exhaustive)

**Category: Communication**
| Action | Notes |
|--------|-------|
| Send email | Template selector + preview. From: any admin email or Postal inbox |
| Send WhatsApp | Template mode (always available) + Freeform mode (shows 24h warning if window may expire) |
| Send SMS | Via Twilio/Africa's Talking |
| Send Instagram DM | Template text only (no link allowed) |
| Send Facebook Messenger message | Template or freeform within window |
| Send in-app notification | Shows in Leadash notification bell |
| Send internal alert | Email/Slack to admin team member |

**Category: CRM**
| Action | |
|--------|--|
| Create or update contact | Upsert by email/phone |
| Add tag | Multi-select |
| Remove tag | Multi-select |
| Update custom field | Field name + value (supports tokens) |
| Assign conversation | To specific agent or round-robin |
| Change lifecycle stage | Lead → Prospect → Customer → Churned |
| Create note | Visible to admin team |
| Create task | With due date + assignee |
| Resolve conversation | |

**Category: Academy**
| Action | |
|--------|--|
| Grant academy access | Immediately or scheduled |
| Revoke academy access | |
| Send course certificate | |
| Unlock specific day | Override normal day-by-day unlock |

**Category: Funnel**
| Action | |
|--------|--|
| Add contact to funnel | Start at step N |
| Remove from funnel | |

**Category: Outreach**
| Action | |
|--------|--|
| Enroll in email campaign | |
| Remove from campaign | |
| Add to lead list | |

**Category: Billing**
| Action | |
|--------|--|
| Apply coupon/discount | |
| Add lead credits | |
| Change workspace plan | Admin-initiated |
| Send payment reminder | |

**Category: Flow Control (Logic)**
| Action | |
|--------|--|
| Wait (delay) | Minutes / hours / days / specific date + time |
| Wait until condition | "Wait until contact has tag 'paid'" |
| Wait until time of day | "Continue at 9 AM contact's timezone" |
| If / Else branch | Condition on any contact field, event data, or plan |
| A/B split | Random % split for testing automation paths |
| Loop | Repeat N times or until condition |
| Go to step | Jump to another step in same automation |
| Trigger another automation | Chain automations (max depth enforced: 5) |
| End | Explicitly end this run |

**Category: Advanced**
| Action | |
|--------|--|
| HTTP webhook | POST to external URL with payload + headers |
| Run Supabase function | Call a custom DB function |

### 3.5 Builder UX overhaul

**Keep React Flow (xyflow) — it's good enough. Fix the UX around it:**

**1. Step library panel (left sidebar):**
```
┌─────────────────────┐
│  🔍 Search actions  │
├─────────────────────┤
│  TRIGGER            │
│  ⚡ Funnel          │
│  ⚡ CRM             │
│  ⚡ Academy         │
│  ⚡ Billing         │
│  ⚡ Schedule        │
│  ⚡ Webhook         │
├─────────────────────┤
│  ACTIONS            │
│  ✉ Communication   │
│  👤 CRM             │
│  🎓 Academy         │
│  💳 Billing         │
│  ⏱ Timing          │
│  🔀 Logic           │
└─────────────────────┘
```

Drag any item onto the canvas. Or click "+" button between existing nodes.

**2. Node design — richer info display:**

Each node shows:
- Icon + category color
- Action name
- One-line summary of config: "Send WhatsApp → Welcome message template"
- Status badge: ✓ Configured | ⚠ Needs setup | ✗ Error

**3. Validation system:**
- Trigger node: must be exactly one, always positioned first (top of flow)
- Cannot connect a node to itself (loop detection)
- Cannot place action nodes that have no incoming connection (orphan detection)
- Warn on infinite loops: A triggers B triggers A (cycle detection via DFS)
- WhatsApp freeform actions: show yellow warning badge "24h window may have expired by this step"
- Missing config: orange badge until all required fields are set

**4. Undo/Redo:**
- Full history stack (50 operations)
- Stored as JSON diff, not full state snapshots (memory efficient)
- Keyboard: Ctrl+Z / Ctrl+Y
- History panel: "Added 'Send email' → Ctrl+Z to undo"
- Persisted to `automation_flows.draft_history` (jsonb array, last 50 ops)

**5. Test mode:**
- "Test with contact" button → type email or phone → simulate automation
- Shows each step: "Would send email ✓" / "Would skip — tag already applied ⚠" / "Would fail — contact has no phone ✗"
- Doesn't actually send anything
- Shows resolved template content (with real contact data substituted)

**6. Execution history:**
- New panel: "Executions" tab alongside the builder
- Table: Contact | Status | Started | Completed | Steps taken
- Click a row → step-by-step timeline: "Step 1 (Wait 24h): completed at 3PM" | "Step 2 (Send WhatsApp): sent ✓"
- Filter: All / Running / Completed / Failed
- Re-run button for failed executions (with "This will actually send messages — confirm?" modal)

**7. Automation templates:**
Pre-built templates admin can load:
- "Welcome sequence" (new signup → WhatsApp → email day 3 → email day 7)
- "Trial conversion" (trial started → day 1 welcome → day 5 nudge → day 13 final push)
- "Abandoned checkout" (checkout initiated → 30min wait → WhatsApp reminder)
- "Churn prevention" (payment failed → immediate email → 3 day WA → 7 day call task)
- "Re-engagement" (no login > 14 days → email → 3 day wait → WA)

### 3.6 Critical edge cases

**Contact unsubscribes mid-automation:**
- All future `sendEmail` actions are automatically skipped for that contact
- WhatsApp, CRM, billing actions continue (unsubscribe only affects email)
- Log the skip: "Email step skipped — contact unsubscribed on [date]"

**WhatsApp 24h window management:**
- Before executing a `sendWhatsapp` action, check `last_inbound_at` vs `now()`
- If > 24h: use template message (fall back to first approved template if none specified)
- If action has no template configured AND window expired: fail step gracefully, create admin notification

**Infinite loop prevention:**
- Automation A triggers Automation B which triggers Automation A
- Track execution chain in `automation_executions.parent_execution_id`
- Max chain depth: 5 levels. Beyond that → fail with "Maximum automation chain depth exceeded"

**Rate limiting:**
- Billing renewal day: 5,000 workspaces all trigger "Subscription renewed" at midnight
- Execution queue is BullMQ — already handles this. But WhatsApp Meta API has 80 messages/second rate limit
- Add per-execution jitter: random delay 0-60 seconds before WhatsApp sends at scale

**Concurrent contact updates:**
- Two automations run simultaneously on same contact → both try to update `lifecycle_stage`
- Solution: use Postgres `UPDATE ... WHERE lifecycle_stage = 'current_value'` to prevent blind overwrites. If WHERE misses, log conflict and skip.

**Deleted trigger dependencies:**
- Admin deletes a funnel that has automations listening to it
- On funnel deletion → scan `automation_flows` for references → set affected flows to `status='needs_attention'` → notify admin

**Timezone-aware waits:**
- "Wait until 9 AM" must use contact's timezone
- Store timezone in `crm_contacts.timezone` (auto-detected from IP at signup, editable)
- If no timezone: use workspace default timezone

**Contact created mid-wait:**
- Automation started, reaches "Wait 3 days", contact's email changes mid-wait
- Execution is pinned to `contact_id` not email — not affected

**Resuming paused automations after schema changes:**
- Admin edits a live automation while 500 contacts are mid-execution
- Executions are pinned to `flow_version` at start time — they run the old version
- New triggers start on the new version
- Show warning in builder: "500 contacts are running version 3. Changes will only apply to new runs."

### 3.7 Schema additions

```sql
-- Add undo history to flows (last 50 ops stored as JSON diff array)
ALTER TABLE automation_flows
  ADD COLUMN draft_history  jsonb DEFAULT '[]',
  ADD COLUMN template_id    uuid; -- if created from template

-- Automation templates (system + workspace custom)
CREATE TABLE automation_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  category     text, -- 'welcome','conversion','re-engagement','billing'
  preview_img  text, -- URL to screenshot
  definition   jsonb NOT NULL, -- full flow_definition JSON
  is_system    boolean DEFAULT false, -- Leadash-provided
  created_at   timestamptz DEFAULT now()
);

-- Add parent chain tracking to executions
ALTER TABLE automation_executions
  ADD COLUMN parent_execution_id uuid REFERENCES automation_executions(id),
  ADD COLUMN chain_depth         int DEFAULT 0,
  ADD COLUMN contact_id          uuid REFERENCES crm_contacts(id);

-- Per-step skip reasons
ALTER TABLE automation_execution_steps
  ADD COLUMN skip_reason text; -- 'unsubscribed','no_phone','window_expired','condition_false'
```

---

## PART 4 — Integration: How All Three Connect

This is the most powerful part — how CRM + Funnels + Automations become one system:

### 4.1 Contact lifecycle data flow

```
Visitor lands on funnel page
  → funnel_sessions row created (anonymous)
  → UTM params captured

Visitor submits optin form
  → crm_contacts row created (or matched by email)
  → funnel_sessions.contact_id linked
  → Automation trigger fired: "funnel_optin_submitted"
  → Automation action: Add tag "funnel:leadash-academy", Send welcome WhatsApp

Visitor purchases
  → Paystack webhook fires
  → funnel_page_events conversion event
  → Automation trigger: "funnel_purchase_completed" with {product: 'challenge', amount: 10000}
  → Automation: Enroll in Academy, Send receipt email, Add to "Customers" lifecycle

Contact sends WhatsApp reply
  → crm_conversations created
  → CRM shows full funnel journey in sidebar
  → Automation trigger: "crm_inbound_message_received" with channel:whatsapp
  → Automation: Auto-tag "needs_attention", Assign to Malik

Contact goes 14 days without logging in
  → Automation trigger: "academy_inactivity" after 14 days
  → Automation: Send reactivation WhatsApp + email
  → If opened email (automation waits) → send follow-up
  → If no response in 3 more days → create CRM task for manual outreach
```

### 4.2 CRM sidebar → automation trigger

From any conversation in CRM, admin can:
- Manually trigger any automation for this contact (with confirmation)
- See all automations this contact is currently running
- Pause/cancel a specific automation for this contact

### 4.3 Funnel → CRM contact auto-creation

When a funnel form is submitted:
1. Look up by email → update existing contact
2. Not found → create new `crm_contacts` row with `source: 'funnel'`, `source_funnel_id`
3. Apply any form-field-to-custom-field mappings defined in the funnel settings
4. Add tag: `funnel:{funnel-slug}` automatically

---

## PART 5 — Build Phases

### Phase 1 (Week 1-2): CRM Foundation
- [ ] Extend `crm_conversations.channel` to include instagram, facebook, sms
- [ ] Add `crm_contacts` fields: lifecycle_stage, custom_fields, source
- [ ] Add `crm_tasks`, `crm_channel_configs`, `crm_merge_suggestions` tables
- [ ] Build contact profile sidebar in CRM UI
- [ ] Add workspace info panel (if contact is a Leadash user)
- [ ] Instagram DM webhook + inbound handler
- [ ] Facebook Messenger webhook + inbound handler
- [ ] Instagram/Facebook channel settings UI (`/admin/crm-settings`)
- [ ] Contact merge UI (manual)
- [ ] Bulk actions in conversation list

### Phase 2 (Week 3-4): Funnels - Data Layer + Basic Builder
- [ ] `funnels`, `funnel_pages`, `funnel_page_versions`, `funnel_sessions`, `funnel_page_events`, `funnel_submissions` migrations
- [ ] Funnel management UI (`/admin/funnels`)
- [ ] Page builder — 15 core blocks (hero, text, image, button, video, form, countdown, testimonial, pricing, FAQ, spacer, divider, custom HTML, list, stats)
- [ ] Funnel routing (serve funnel pages at `/[funnel-slug]/[page-slug]`)
- [ ] Connect pages to Paystack checkout (order page type)
- [ ] Connect pages to Academy enrollment (thankyou page action)
- [ ] Optin form → CRM contact auto-creation

### Phase 3 (Week 5-6): Funnels - Advanced + A/B
- [ ] A/B test engine (variant assignment, stickiness, conversion tracking)
- [ ] Statistical significance calculation (chi-squared, Bayesian)
- [ ] A/B test UI in funnel builder
- [ ] Page version history + rollback
- [ ] Funnel analytics dashboard
- [ ] UTM tracking through funnel (first-touch attribution)
- [ ] Custom domain support (CNAME + SSL)
- [ ] Popup blocks (exit-intent, timed)
- [ ] Funnel templates (5 starter templates)
- [ ] Slug conflict checker

### Phase 4 (Week 7-8): Automations Revamp
- [ ] Full trigger registry (all 30+ triggers) with event firing in each system
- [ ] Full action registry (all 40+ actions) in worker
- [ ] Builder UX: rename duplicate_policy labels, step library panel, node config redesign
- [ ] Undo/redo (50-step history, keyboard shortcuts)
- [ ] Smart validation: cycle detection, orphan nodes, missing config badges
- [ ] Test mode (dry-run against a real contact)
- [ ] Execution history panel (per automation + per contact)
- [ ] Automation templates (8 pre-built)
- [ ] WhatsApp 24h window enforcement in automation executor
- [ ] Rate limiting + jitter for mass triggers
- [ ] Timezone-aware wait nodes

### Phase 5 (Week 9-10): CRM Advanced + Reporting
- [ ] AI reply suggestions (Claude Haiku, context-aware)
- [ ] Sentiment analysis on inbound messages (tag high-frustration convos)
- [ ] Auto-categorize conversations
- [ ] Team assignment + collision detection (Supabase Realtime)
- [ ] @mentions in notes (with notifications)
- [ ] SLA tracking (first response time, breach alerts)
- [ ] CSAT survey after conversation resolution
- [ ] CRM reporting dashboard
- [ ] Business hours + auto-reply outside hours
- [ ] Nightly merge suggestion job

### Phase 6 (Week 11-12): SMS + Live Chat + Polish
- [ ] SMS channel (Twilio integration)
- [ ] Live chat widget (embeddable JS snippet)
- [ ] Contact import (CSV with field mapping)
- [ ] Keyboard shortcuts across CRM (j/k navigate, r reply, e resolve, n note)
- [ ] Mobile-responsive CRM view
- [ ] Advanced funnel personalization (dynamic content based on contact data)
- [ ] Funnel SEO controls (noindex, canonical, structured data)
- [ ] End-to-end test: full funnel → CRM → automation → follow-up loop

---

## PART 6 — Key Technical Decisions

### 6.1 Funnel page rendering
Funnel pages need to be fast (marketing pages). Options:
- **A) Server-side render in Next.js** — clean, uses app router, good SEO. Problem: admin editing must be via API, not direct file edit.
- **B) Static generation with ISR** — best performance. Pages regenerated on publish. 60s max stale.
- **Recommendation: B (ISR)**. `revalidatePath('/[funnel-slug]/[page-slug]')` on publish. Admin saves draft → no regeneration. Admin clicks Publish → triggers revalidation. This gives instant publish + fast serving.

### 6.2 Page builder storage format
Blocks stored as JSON in `funnel_pages.blocks`:
```json
[
  {
    "id": "block_abc123",
    "type": "hero",
    "props": {
      "headline": "Master B2B Outreach",
      "subtext": "30-day challenge for Nigerian founders",
      "cta_text": "Start Free Today",
      "cta_url": "/checkout",
      "background": { "type": "gradient", "from": "#1a1a2e", "to": "#16213e" }
    },
    "styles": {
      "desktop": { "padding": "80px 40px" },
      "mobile": { "padding": "40px 20px" }
    }
  }
]
```
The renderer is a React component tree that maps block type to component. Same data structure used in editor and viewer.

### 6.3 Automation execution engine
Currently: worker processes automation steps synchronously. For wait nodes: re-enqueue job with `delay` option in BullMQ. This is correct.

What to add:
- `automation_executions.current_node_id` is already tracked. Good.
- Add per-step timeout: if a step runs > 30s (e.g., hanging HTTP webhook call), mark it failed and continue.
- Failed steps: by default, log the error and continue to next step. Exception: `critical: true` steps (billing actions) → halt execution and alert admin.

### 6.4 Multi-tenant vs single-tenant CRM
Currently the CRM is Leadash-internal (admins only, RLS checks `admins` table). This is the right architecture for now — the CRM is a tool for the Leadash team to manage their own customers. It is NOT a workspace-level tool (workspaces don't get their own CRM inbox). This distinction is important and should be maintained.

However: **automations can fire on behalf of any workspace** (e.g., send a WhatsApp message when workspace signs up). The `automation_executions.workspace_id` + `user_id` fields capture this correctly.

### 6.5 Instagram/Facebook API gotchas
- Both require business verification and app review for DM permissions
- Facebook: need `pages_messaging` permission + Page token (not User token)
- Instagram: need `instagram_manage_messages` permission
- Webhook challenge verification must happen within 15 seconds
- Message deduplication: Meta re-sends webhooks if Leadash doesn't respond with 200 in 5s. Must store `provider_message_id` and deduplicate on insert.
- Media must be downloaded and stored in Supabase Storage immediately — Meta media URLs expire in 24h

---

## Summary of New Files/Routes

| Path | Purpose |
|------|---------|
| `apps/web/src/app/(admin)/admin/crm-settings/page.tsx` | Channel connections, team, SLA, canned responses |
| `apps/web/src/app/(admin)/admin/funnels/page.tsx` | Funnel list + management |
| `apps/web/src/app/(admin)/admin/funnels/[id]/page.tsx` | Funnel detail (pages list + analytics) |
| `apps/web/src/app/(admin)/admin/funnels/[id]/pages/[pageId]/builder/page.tsx` | Page builder |
| `apps/web/src/app/(admin)/admin/funnels/[id]/ab-tests/page.tsx` | A/B test management |
| `apps/web/src/app/[funnelSlug]/[pageSlug]/page.tsx` | Public funnel page renderer |
| `apps/web/src/app/api/funnels/route.ts` | CRUD funnels |
| `apps/web/src/app/api/funnels/[id]/pages/route.ts` | CRUD pages |
| `apps/web/src/app/api/funnels/[id]/pages/[pageId]/publish/route.ts` | Publish + ISR revalidate |
| `apps/web/src/app/api/funnels/[id]/ab-tests/route.ts` | AB test management |
| `apps/web/src/app/api/crm/inbound-instagram/route.ts` | Instagram webhook |
| `apps/web/src/app/api/crm/inbound-facebook/route.ts` | Facebook Messenger webhook |
| `apps/web/src/app/api/crm/contacts/route.ts` | Contact CRUD + merge |
| `apps/web/src/app/api/crm/tasks/route.ts` | Task CRUD |
| `apps/web/src/app/api/automations/webhook/[secret]/route.ts` | Inbound webhook trigger |
| `supabase/migrations/053_funnels.sql` | Funnel + page builder schema |
| `supabase/migrations/054_crm_extended.sql` | CRM extensions (Instagram, tasks, merge) |
| `supabase/migrations/055_automation_v2.sql` | Automation extensions (templates, chain depth) |
| `apps/worker/src/workers/automation-worker.ts` | Extended with all new action types |

---

*This document is a living plan. Update it as implementation decisions are made.*
