#!/usr/bin/env python3
"""
1. Add normalize_company() SQL function to VPS DB
2. Add name_normalized + name_aliases columns to discover_companies
3. Backfill name_normalized for all existing companies
Run locally (connects to VPS DB directly).
"""
import psycopg2, time

DB_URL = "postgres://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@89.117.51.235:5432/leadash_leads"

MIGRATION = """
-- 1. Normalization function
--    Strips legal suffixes (Inc, Corp, LLC, Ltd, etc.), lowercases,
--    removes punctuation, collapses spaces.
CREATE OR REPLACE FUNCTION normalize_company(n text) RETURNS text AS $$
DECLARE
  r text;
BEGIN
  IF n IS NULL OR trim(n) = '' THEN RETURN NULL; END IF;

  r := lower(trim(n));

  -- Strip leading "the "
  r := regexp_replace(r, '^the\\s+', '');

  -- Strip terminal legal suffix (with optional preceding comma/space)
  r := regexp_replace(r,
    ',?\\s*(incorporated|corporation|limited|company|inc\\.?|l\\.?l\\.?c\\.?|corp\\.?|ltd\\.?|l\\.?l\\.?p\\.?|plc\\.?|gmbh|s\\.?a\\.?|b\\.?v\\.?|n\\.?v\\.?|a\\.?g\\.?|co\\.)\\s*$',
    '', 'gi');

  -- Remove all non-alphanumeric except spaces
  r := regexp_replace(r, '[^a-z0-9 ]', '', 'g');

  -- Collapse whitespace
  r := trim(regexp_replace(r, '\\s+', ' ', 'g'));

  RETURN CASE WHEN r = '' THEN NULL ELSE r END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Add columns (idempotent)
ALTER TABLE discover_companies
  ADD COLUMN IF NOT EXISTS name_normalized text,
  ADD COLUMN IF NOT EXISTS name_aliases    text[];

-- 3. Index on name_normalized
CREATE INDEX IF NOT EXISTS discover_companies_name_norm_idx
  ON discover_companies (name_normalized)
  WHERE name_normalized IS NOT NULL;

-- 4. Trigger: keep name_normalized in sync on insert/update
CREATE OR REPLACE FUNCTION trg_companies_normalize()
RETURNS trigger AS $$
BEGIN
  NEW.name_normalized := normalize_company(NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_normalize_trig ON discover_companies;
CREATE TRIGGER companies_normalize_trig
  BEFORE INSERT OR UPDATE OF name
  ON discover_companies
  FOR EACH ROW EXECUTE FUNCTION trg_companies_normalize();
"""

BACKFILL = """
UPDATE discover_companies
SET name_normalized = normalize_company(name)
WHERE name_normalized IS NULL AND name IS NOT NULL;
"""

def main():
    print("Connecting to VPS DB...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    print("Applying migration (function + columns + index + trigger)...")
    cur.execute(MIGRATION)
    print("  Done.")

    print("Backfilling name_normalized on discover_companies...")
    t0 = time.time()
    cur.execute(BACKFILL)
    print(f"  Done in {time.time()-t0:.1f}s")

    cur.execute("SELECT COUNT(*) FROM discover_companies WHERE name_normalized IS NOT NULL")
    filled = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM discover_companies")
    total = cur.fetchone()[0]
    print(f"  {filled:,} / {total:,} companies have name_normalized")

    # Sample check
    cur.execute("""
        SELECT name, name_normalized FROM discover_companies
        WHERE name IS NOT NULL AND name_normalized IS NOT NULL
        ORDER BY random() LIMIT 12
    """)
    print("\nSample normalizations:")
    for name, norm in cur.fetchall():
        print(f"  {name!r:40s} → {norm!r}")

    cur.close()
    conn.close()
    print("\nMigration complete. Now run link-people-companies.py on VPS to link people rows.")

if __name__ == "__main__":
    main()
