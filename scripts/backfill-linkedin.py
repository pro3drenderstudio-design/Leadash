"""
Backfill discover_companies.linkedin_url from Apollo org CSV.
LinkedIn URL is in col 27 (organization_linkedin_numerical_urls).
Join to DB rows by domain first, then by name.

Run on VPS:
  python3 /data/backfill-linkedin.py
"""
import csv, re, sys, time, psycopg2, psycopg2.extras
csv.field_size_limit(sys.maxsize)

DSN = "host=localhost port=5432 dbname=leadash_leads user=leadash_user password='U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0'"
CSV_PATH = "/data/apollo/apollo_orgs.csv"
BATCH = 5000

def parse_linkedin(raw):
    if not raw:
        return None
    m = re.search(r"https?://[^\s'\"\\]+linkedin\.com/company/\d+", raw)
    return m.group(0) if m else None

conn = psycopg2.connect(DSN)
cur  = conn.cursor()

print("Loading company index from DB...")
cur.execute("SELECT id::text, LOWER(COALESCE(name,'')), LOWER(COALESCE(domain,'')) FROM discover_companies WHERE source='apollo'")
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

        linkedin = parse_linkedin(row[27] if len(row) > 27 else "")
        if not linkedin:
            skipped += 1
            continue

        domain = (row[29].strip() if len(row) > 29 else "").lower()
        name   = (row[1].strip()  if len(row) > 1  else "").lower()

        db_id = by_domain.get(domain) or by_name.get(name)
        if not db_id:
            skipped += 1
            continue

        updates.append((linkedin, db_id))
        found += 1

        if len(updates) >= BATCH:
            psycopg2.extras.execute_batch(cur, """
                UPDATE discover_companies
                SET linkedin_url = %s
                WHERE id = %s::uuid AND linkedin_url IS NULL
            """, updates)
            conn.commit()
            updates.clear()
            elapsed = time.time() - t0
            print(f"  row {i:>8,} | {found:>7,} linked | {skipped:>7,} skipped | {elapsed/60:.1f}min")

if updates:
    psycopg2.extras.execute_batch(cur, """
        UPDATE discover_companies
        SET linkedin_url = %s
        WHERE id = %s::uuid AND linkedin_url IS NULL
    """, updates)
    conn.commit()
    found += len(updates)

cur.close()
conn.close()
elapsed = time.time() - t0
print(f"\nDone: {found:,} linkedin_url backfilled in {elapsed/60:.1f} min")
