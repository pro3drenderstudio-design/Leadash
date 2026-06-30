#!/usr/bin/env python3
"""
Post-PDL enrichment for leadash_leads database.

Steps:
1. Link unlinked people to companies via email domain
2. Infer missing company domains from most common employee email domain
3. Re-link after domain inference
4. Update employee_count estimates from linked people count
5. Backfill company country/city from majority of linked people

Run after import-pdl.py finishes.
"""
import psycopg2, time, sys

DB_URL = "postgres://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"

FREEMAIL = frozenset([
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
    "me.com", "aol.com", "protonmail.com", "mail.com", "yandex.com",
    "zoho.com", "live.com", "yahoo.co.uk", "hotmail.co.uk", "msn.com",
    "yahoo.in", "rediffmail.com", "yahoo.co.in", "googlemail.com",
    "gmx.com", "gmx.de", "web.de", "t-online.de", "freenet.de",
])

def step(conn, cur, label, sql):
    t = time.time()
    print(f"{label}...", flush=True)
    cur.execute(sql)
    n = cur.rowcount
    conn.commit()
    print(f"  -> {n:,} rows affected ({time.time()-t:.0f}s)", flush=True)
    return n

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Give the query planner more memory for large hash joins
    cur.execute("SET work_mem = '1GB'")
    cur.execute("SET maintenance_work_mem = '2GB'")

    freemail_list = ", ".join(f"'{d}'" for d in sorted(FREEMAIL))

    print("=" * 60)
    print("PDL Enrichment — starting")
    print("=" * 60)

    # ── Step 1: Link unlinked people → companies via email domain ──
    step(conn, cur, "Step 1: Link people to companies by email domain", f"""
        UPDATE discover_people dp
        SET
            company_id   = dc.id,
            company_name = dc.name
        FROM discover_companies dc
        WHERE dp.company_id IS NULL
          AND dp.email IS NOT NULL AND dp.email <> ''
          AND dc.domain  IS NOT NULL AND dc.domain  <> ''
          AND lower(split_part(dp.email, '@', 2)) = lower(dc.domain)
    """)

    # ── Step 2: Infer missing domains from employee email patterns ──
    step(conn, cur, "Step 2: Infer company domains from employee emails", f"""
        WITH domain_counts AS (
            SELECT
                dp.company_id,
                lower(split_part(dp.email, '@', 2)) AS d,
                COUNT(*) AS cnt
            FROM discover_people dp
            JOIN discover_companies dc ON dp.company_id = dc.id
            WHERE dc.domain IS NULL
              AND dp.email  IS NOT NULL AND dp.email <> ''
              AND lower(split_part(dp.email, '@', 2)) NOT IN ({freemail_list})
              AND lower(split_part(dp.email, '@', 2)) <> ''
            GROUP BY dp.company_id, lower(split_part(dp.email, '@', 2))
        ),
        best AS (
            SELECT DISTINCT ON (company_id)
                company_id, d AS domain
            FROM domain_counts
            ORDER BY company_id, cnt DESC
        )
        UPDATE discover_companies dc
        SET domain = best.domain
        FROM best
        WHERE dc.id = best.company_id
          AND dc.domain IS NULL
    """)

    # ── Step 3: Re-link after domain inference ──
    step(conn, cur, "Step 3: Re-link people after domain inference", f"""
        UPDATE discover_people dp
        SET
            company_id   = dc.id,
            company_name = dc.name
        FROM discover_companies dc
        WHERE dp.company_id IS NULL
          AND dp.email IS NOT NULL AND dp.email <> ''
          AND dc.domain  IS NOT NULL AND dc.domain  <> ''
          AND lower(split_part(dp.email, '@', 2)) = lower(dc.domain)
    """)

    # ── Step 4: Estimate employee_count from linked people count ──
    step(conn, cur, "Step 4: Estimate employee_count from linked people", """
        UPDATE discover_companies dc
        SET employee_count = counts.n
        FROM (
            SELECT company_id, COUNT(*) AS n
            FROM discover_people
            WHERE company_id IS NOT NULL
            GROUP BY company_id
        ) counts
        WHERE dc.id = counts.company_id
          AND (dc.employee_count IS NULL OR dc.employee_count = 0)
    """)

    # ── Step 5: Backfill company country from majority of employees ──
    step(conn, cur, "Step 5: Backfill company country from employee locations", """
        WITH loc AS (
            SELECT
                company_id,
                country,
                COUNT(*) AS cnt
            FROM discover_people
            WHERE company_id IS NOT NULL
              AND country IS NOT NULL AND country <> ''
            GROUP BY company_id, country
        ),
        best AS (
            SELECT DISTINCT ON (company_id)
                company_id, country
            FROM loc
            ORDER BY company_id, cnt DESC
        )
        UPDATE discover_companies dc
        SET country = best.country
        FROM best
        WHERE dc.id = best.company_id
          AND (dc.country IS NULL OR dc.country = '')
    """)

    cur.close()
    conn.close()

    print()
    print("=" * 60)
    print("Enrichment complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
