-- ── 062: Offer Builder — composable offers (grants + pricing + checkout) ──────

CREATE TABLE IF NOT EXISTS offers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,
  name                text NOT NULL,
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),

  -- pricing
  pricing_model       text NOT NULL DEFAULT 'one_time'
                       CHECK (pricing_model IN ('one_time','recurring','trial','free','payment_plan','pwyw')),
  price_ngn           integer NOT NULL DEFAULT 0,
  compare_at_ngn      integer,
  currency_mode       text NOT NULL DEFAULT 'auto' CHECK (currency_mode IN ('auto','ngn_only','usd_only')),
  billing_interval    text CHECK (billing_interval IN ('monthly','quarterly','annual')),
  trial_days          integer,
  installments        jsonb,              -- { count, amount_ngn }
  pwyw_min_ngn        integer,

  -- composition
  grants              jsonb NOT NULL DEFAULT '[]',   -- OfferGrant[] (discriminated union, each has a client-assigned id)
  bumps               jsonb NOT NULL DEFAULT '[]',   -- OfferBump[]
  upsell              jsonb,                          -- OfferUpsell | null
  downsell            jsonb,                          -- OfferUpsell | null

  -- checkout page
  checkout            jsonb NOT NULL DEFAULT '{}',   -- { headline, subhead, badge, layout, show_*, fields }

  -- promotion
  expires_at          timestamptz,
  on_expire           text NOT NULL DEFAULT 'hide_button' CHECK (on_expire IN ('hide_button','waitlist','full_price')),
  stock_limit         integer,
  recover_abandoned   boolean NOT NULL DEFAULT false,

  -- fulfillment / settings
  auto_grant          boolean NOT NULL DEFAULT true,
  manual_approval     boolean NOT NULL DEFAULT false,
  no_workspace_action text NOT NULL DEFAULT 'create' CHECK (no_workspace_action IN ('create','invite','attach_by_email')),
  after_purchase      text NOT NULL DEFAULT 'confirmation' CHECK (after_purchase IN ('confirmation','custom_url','dashboard')),
  custom_url          text,
  send_receipt        boolean NOT NULL DEFAULT true,
  send_whatsapp       boolean NOT NULL DEFAULT false,
  notify_admin        boolean NOT NULL DEFAULT true,
  refund_window_days  integer NOT NULL DEFAULT 7,

  -- funnel linkage
  funnel_ids          uuid[] NOT NULL DEFAULT '{}',

  views_count         integer NOT NULL DEFAULT 0,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_funnel_ids ON offers USING gin(funnel_ids);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers_admin_only" ON offers FOR ALL USING (false);

-- ── Discount codes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offer_discount_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id        uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  code            text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('percent','fixed')),
  value           integer NOT NULL,
  max_redemptions integer,
  manual_only     boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  redemptions     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(offer_id, code)
);

ALTER TABLE offer_discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_discount_codes_admin_only" ON offer_discount_codes FOR ALL USING (false);
CREATE INDEX IF NOT EXISTS idx_offer_discount_codes_offer ON offer_discount_codes(offer_id);

-- ── Purchases ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offer_purchases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id               uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  workspace_id           uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_name             text,
  buyer_email            text,
  buyer_phone            text,
  line_items             jsonb NOT NULL DEFAULT '[]',  -- [{ kind:'base'|'bump'|'upsell', label, amount_ngn }]
  discount_code_id       uuid REFERENCES offer_discount_codes(id),
  subtotal_ngn           integer NOT NULL DEFAULT 0,
  discount_ngn           integer NOT NULL DEFAULT 0,
  total_ngn              integer NOT NULL DEFAULT 0,
  currency               text NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN','USD')),
  paystack_reference     text UNIQUE,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','failed')),
  granted_items          jsonb NOT NULL DEFAULT '[]',  -- per-grant fulfillment outcome
  manual_approval_status text CHECK (manual_approval_status IN ('pending','approved','rejected')),
  upsell_status          text CHECK (upsell_status IN ('offered','accepted','declined')),
  granted_at             timestamptz,
  refunded_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE offer_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_purchases_admin_only" ON offer_purchases FOR ALL USING (false);
CREATE INDEX IF NOT EXISTS idx_offer_purchases_offer ON offer_purchases(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_purchases_workspace ON offer_purchases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_offer_purchases_status ON offer_purchases(offer_id, status);

-- ── Checkout funnel events (lightweight analytics) ───────────────────────────────
CREATE TABLE IF NOT EXISTS offer_checkout_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id    uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  session_id  text NOT NULL,
  event_type  text NOT NULL CHECK (event_type IN ('view','started','payment_added','purchased')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE offer_checkout_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_checkout_events_admin_only" ON offer_checkout_events FOR ALL USING (false);
CREATE INDEX IF NOT EXISTS idx_offer_checkout_events_offer ON offer_checkout_events(offer_id, event_type, created_at);

NOTIFY pgrst, 'reload schema';
