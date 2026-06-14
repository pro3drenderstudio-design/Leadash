-- ─── Currency rate table ─────────────────────────────────────────────────────
-- Stores FX rates expressed as: 1 NGN = `rate_to_ngn` units of currency_code.
-- Refreshed daily by a cron job hitting open.er-api.com. Used by the
-- geo-aware CurrencyProvider to convert NGN prices to the visitor's local
-- currency for display purposes only — Paystack still charges in NGN.
--
-- Why "rate_to_ngn" instead of "rate_from_ngn"? Most public FX APIs return
-- rates relative to a base (usually USD). We store the conversion factor in
-- the direction we actually use it: multiply an NGN price by this number to
-- get the equivalent in the local currency.

CREATE TABLE IF NOT EXISTS currency_rates (
  currency_code text PRIMARY KEY,           -- ISO 4217 (NGN, USD, GHS, KES, ZAR, MAD, EGP, XOF, …)
  rate_to_ngn   numeric(18, 8) NOT NULL,    -- 1 NGN = rate_to_ngn `currency_code`
  symbol        text,                       -- "₦", "$", "GH₵", "KSh" — for nicer display
  updated_at    timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL DEFAULT 'open.er-api.com'  -- audit trail
);

ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;

-- Seed NGN so the conversion math has a no-op self entry. Other rows are
-- populated by the daily cron — the table is empty-but-functional on day one.
INSERT INTO currency_rates (currency_code, rate_to_ngn, symbol, source)
VALUES ('NGN', 1, '₦', 'seed')
ON CONFLICT (currency_code) DO NOTHING;

-- USD seeded with a sensible default so US/EU visitors see something
-- reasonable before the first cron run. Real value comes in within 24h.
INSERT INTO currency_rates (currency_code, rate_to_ngn, symbol, source)
VALUES ('USD', 0.00065, '$', 'seed')
ON CONFLICT (currency_code) DO NOTHING;
