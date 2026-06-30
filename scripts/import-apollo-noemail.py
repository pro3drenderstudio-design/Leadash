#!/usr/bin/env python3
"""
Import Apollo people rows that have linkedin_url but NO email.
The email-based rows were already imported by the first pass.
Deduplicates on lower(linkedin_url) partial unique index.
Run on VPS: python3 /data/apollo/import-apollo-noemail.py
"""

import csv, os, json, time, uuid, sys
import psycopg2
from psycopg2.extras import execute_values

csv.field_size_limit(10_000_000)  # some Apollo rows have huge embedded JSON

DB_URL       = "postgres://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"
CSV_PATH     = "/data/apollo/apollo_people.csv"
CHECKPOINT   = "/data/apollo/checkpoint-noemail.json"
BATCH_SIZE   = 5_000
LOG_EVERY    = 200_000

# Column indices (0-based, tab-delimited)
COL_FIRST    = 1   # person_first_name_unanalyzed
COL_LAST     = 2   # person_last_name_unanalyzed
COL_TITLE    = 4   # person_title
COL_SENIORITY= 6   # person_seniority
COL_EMAIL    = 9   # person_email
COL_PHONE    = 10  # person_phone
COL_LINKEDIN = 13  # person_linkedin_url
COL_COMPANY  = 17  # sanitized_organization_name_unanalyzed
COL_CITY     = 18  # person_location_city
COL_STATE    = 20  # person_location_state
COL_COUNTRY  = 22  # person_location_country

def v(row, idx):
    try:
        s = row[idx].strip()
        return s if s else None
    except IndexError:
        return None

# name → company_id cache (None = confirmed miss, avoids re-querying)
_company_cache: dict = {}

def resolve_company_ids(cur, names: list) -> dict:
    """Batch-lookup company_id for a list of raw company names. Returns {name: uuid|None}."""
    uncached = list({n for n in names if n and n not in _company_cache})
    if uncached:
        # Single query: normalize each input name, join against companies table
        cur.execute("""
            SELECT DISTINCT ON (normalize_company(n))
                n AS raw_name, c.id AS company_id
            FROM unnest(%s::text[]) AS n
            JOIN discover_companies c ON c.name_normalized = normalize_company(n)
        """, (uncached,))
        found = {row[0]: row[1] for row in cur.fetchall()}
        for name in uncached:
            _company_cache[name] = found.get(name)   # None for misses
    return {n: _company_cache.get(n) for n in names}

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    start_line = 0
    inserted = 0
    skipped = 0
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT) as f:
            cp = json.load(f)
            start_line = cp.get("lines", 0)
            inserted   = cp.get("inserted", 0)
            skipped    = cp.get("skipped", 0)
        if start_line:
            print(f"Resuming from line {start_line:,} | {inserted:,} inserted so far")

    batch = []
    t0 = time.time()

    with open(CSV_PATH, encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        next(reader)  # skip header
        for lineno, row in enumerate(reader, 1):
            if lineno <= start_line:
                continue

            email    = v(row, COL_EMAIL)
            linkedin = v(row, COL_LINKEDIN)

            # Only rows with NO email but WITH linkedin_url
            if email:
                skipped += 1
                continue
            if not linkedin:
                skipped += 1
                continue

            batch.append((
                str(uuid.uuid4()),
                v(row, COL_FIRST),
                v(row, COL_LAST),
                v(row, COL_TITLE),
                v(row, COL_SENIORITY),
                linkedin,
                None,                   # email
                v(row, COL_PHONE),
                v(row, COL_COUNTRY),
                v(row, COL_STATE),
                v(row, COL_CITY),
                v(row, COL_COMPANY),
                "apollo",
            ))

            if len(batch) >= BATCH_SIZE:
                # Resolve company_ids for this batch
                company_map = resolve_company_ids(cur, [r[11] for r in batch])
                enriched = [r + (company_map.get(r[11]),) for r in batch]
                execute_values(cur, """
                    INSERT INTO discover_people
                      (id, first_name, last_name, title, seniority, linkedin_url,
                       email, phone, country, state, city, company_name, source, company_id)
                    VALUES %s
                    ON CONFLICT DO NOTHING
                """, enriched)
                conn.commit()
                inserted += cur.rowcount if cur.rowcount >= 0 else len(batch)
                batch = []

            if lineno % LOG_EVERY == 0:
                elapsed = time.time() - t0
                rate    = lineno / elapsed
                eta     = (94_708_784 - lineno) / rate / 60
                with open(CHECKPOINT, "w") as cp_f:
                    json.dump({"lines": lineno, "inserted": inserted, "skipped": skipped}, cp_f)
                print(f"  line {lineno:,} | {inserted:,} inserted | {skipped:,} skipped | {rate:,.0f}/s | ETA ~{eta:.0f}min")
                sys.stdout.flush()

    if batch:
        company_map = resolve_company_ids(cur, [r[11] for r in batch])
        enriched = [r + (company_map.get(r[11]),) for r in batch]
        execute_values(cur, """
            INSERT INTO discover_people
              (id, first_name, last_name, title, seniority, linkedin_url,
               email, phone, country, state, city, company_name, source, company_id)
            VALUES %s
            ON CONFLICT DO NOTHING
        """, enriched)
        conn.commit()
        inserted += cur.rowcount if cur.rowcount >= 0 else len(batch)

    with open(CHECKPOINT, "w") as cp_f:
        json.dump({"lines": 0, "inserted": inserted, "skipped": skipped}, cp_f)
    print(f"\nDone: {inserted:,} no-email linkedin records inserted")
    cur.close()
    conn.close()

if __name__ == "__main__":
    import sys
    main()
