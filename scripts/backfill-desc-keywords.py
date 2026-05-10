"""
Backfill discover_companies.description and keywords from Apollo org CSV.

  description ← col 19 (organization_short_description)
  keywords    ← col 12 (organization_linkedin_specialties)

Join to DB rows by domain first, then by name.
Idempotent: only updates rows where description IS NULL.

Run on VPS:
  python3 /data/backfill-desc-keywords.py
"""
import csv, re, sys, time, psycopg2, psycopg2.extras
csv.field_size_limit(sys.maxsize)

DSN = "host=localhost port=5432 dbname=leadash_leads user=leadash_user password='U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0'"
CSV_PATH = "/data/apollo/apollo_orgs.csv"
BATCH = 5000

O_NAME        = 1
O_LINKEDIN_SP = 12   # organization_linkedin_specialties (comma-separated string)
O_SHORT_DESC  = 19   # organization_short_description
O_DOMAIN      = 29

def safe(row, idx):
    try:
        v = row[idx].strip()
        return v if v else None
    except IndexError:
        return None

import subprocess
# Add keywords column as postgres superuser
result = subprocess.run(
    ["sudo", "-u", "postgres", "psql", "-d", "leadash_leads", "-c",
     "ALTER TABLE discover_companies ADD COLUMN IF NOT EXISTS keywords text;"],
    capture_output=True, text=True
)
print("DDL:", result.stdout.strip() or result.stderr.strip())

conn = psycopg2.connect(DSN)
cur  = conn.cursor()

print("Loading company index from DB...")
cur.execute("""
    SELECT id::text, LOWER(COALESCE(name,'')), LOWER(COALESCE(domain,''))
    FROM discover_companies
    WHERE source = 'apollo'
""")
by_domain = {}
by_name   = {}
for db_id, name, domain in cur.fetchall():
    if domain: by_domain.setdefault(domain, db_id)
    if name:   by_name.setdefault(name, db_id)
print(f"  {len(by_domain):,} domains, {len(by_name):,} names indexed\n")

updates = []
found = skipped = 0
t0 = time.time()

with open(CSV_PATH, encoding="utf-8", errors="replace") as f:
    reader = csv.reader(f, delimiter="\t")
    for i, row in enumerate(reader):
        if i == 0:
            continue

        desc     = safe(row, O_SHORT_DESC)
        keywords = safe(row, O_LINKEDIN_SP)
        if not desc and not keywords:
            skipped += 1
            continue

        domain = (safe(row, O_DOMAIN) or "").lower()
        name   = (safe(row, O_NAME)   or "").lower()

        db_id = by_domain.get(domain) or by_name.get(name)
        if not db_id:
            skipped += 1
            continue

        updates.append((desc, keywords, db_id))
        found += 1

        if len(updates) >= BATCH:
            psycopg2.extras.execute_batch(cur, """
                UPDATE discover_companies
                SET description = COALESCE(description, %s),
                    keywords    = COALESCE(keywords, %s)
                WHERE id = %s::uuid
                  AND (description IS NULL OR keywords IS NULL)
            """, updates)
            conn.commit()
            updates.clear()
            elapsed = time.time() - t0
            print(f"  row {i:>8,} | {found:>7,} updated | {skipped:>7,} skipped | {elapsed/60:.1f}min")

if updates:
    psycopg2.extras.execute_batch(cur, """
        UPDATE discover_companies
        SET description = COALESCE(description, %s),
            keywords    = COALESCE(keywords, %s)
        WHERE id = %s::uuid
          AND (description IS NULL OR keywords IS NULL)
    """, updates)
    conn.commit()

cur.close()
conn.close()
elapsed = time.time() - t0
print(f"\nDone: {found:,} companies backfilled in {elapsed/60:.1f} min")
