-- 7-Day Challenge signups (₦10,000, bank-transfer-or-Paystack) never reached
-- the books: admin confirmation (apps/web/src/app/api/admin/challenge-signups/[id]/route.ts)
-- only touches challenge_signups/academy_enrollments, and the table itself
-- never stored an amount. This is a pure DB-trigger addition — zero
-- application-code changes needed, since the confirm/reject handler already
-- does `UPDATE challenge_signups SET status = ...`, which this trigger hooks.
ALTER TABLE challenge_signups
  ADD COLUMN IF NOT EXISTS amount_ngn integer,
  ADD COLUMN IF NOT EXISTS fees_kobo integer;

CREATE OR REPLACE FUNCTION finance_tx_sync_challenge_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE default_account uuid;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    SELECT default_bank_account_id INTO default_account FROM finance_settings WHERE id = 1;

    INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
    VALUES (
      COALESCE(NEW.confirmed_at::date, CURRENT_DATE), 'revenue', 'revenue.challenge',
      GREATEST(0, COALESCE(NEW.amount_ngn, 10000)),
      NEW.full_name || ' — 7-Day Challenge', true, 'challenge_signups', NEW.id::text, 'gross', default_account
    )
    ON CONFLICT (source_type, source_id, kind) DO UPDATE SET amount_ngn = EXCLUDED.amount_ngn, updated_at = now();

    IF COALESCE(NEW.fees_kobo, 0) > 0 THEN
      INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
      VALUES (
        COALESCE(NEW.confirmed_at::date, CURRENT_DATE), 'cogs', 'cogs.payment_fees',
        ROUND(NEW.fees_kobo / 100.0, 2), 'Paystack fee — ' || NEW.full_name, true, 'challenge_signups', NEW.id::text, 'fee', default_account
      )
      ON CONFLICT (source_type, source_id, kind) DO UPDATE SET amount_ngn = EXCLUDED.amount_ngn, updated_at = now();
    END IF;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE finance_transactions SET amount_ngn = 0, updated_at = now()
    WHERE source_type = 'challenge_signups' AND source_id = NEW.id::text AND amount_ngn <> 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS challenge_signups_finance_tx_sync ON challenge_signups;
CREATE TRIGGER challenge_signups_finance_tx_sync
  AFTER UPDATE OF status ON challenge_signups
  FOR EACH ROW EXECUTE FUNCTION finance_tx_sync_challenge_row();

-- Backfill: historical confirmed signups predate the amount_ngn column, and
-- the trigger above only fires on future status transitions.
UPDATE challenge_signups
SET amount_ngn = COALESCE(
  (SELECT (value)::int FROM admin_settings WHERE key = 'funnel_challenge_price'),
  10000
)
WHERE status = 'confirmed' AND amount_ngn IS NULL;

INSERT INTO finance_transactions (date, type, category, amount_ngn, description, is_auto, source_type, source_id, kind, bank_account_id)
SELECT
  COALESCE(confirmed_at::date, created_at::date, CURRENT_DATE), 'revenue', 'revenue.challenge',
  GREATEST(0, COALESCE(amount_ngn, 10000)),
  full_name || ' — 7-Day Challenge', true, 'challenge_signups', id::text, 'gross',
  (SELECT default_bank_account_id FROM finance_settings WHERE id = 1)
FROM challenge_signups
WHERE status = 'confirmed'
ON CONFLICT (source_type, source_id, kind) DO NOTHING;
