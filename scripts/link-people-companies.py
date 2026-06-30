#!/usr/bin/env python3
"""
Batch-link discover_people.company_id to discover_companies
by matching normalize_company(company_name) = name_normalized.
Run on VPS: nohup python3 /data/link-people-companies.py > /data/link-companies.log 2>&1 &
"""
import psycopg2, time, json, os, sys

DB_URL     = "postgres://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"
CHECKPOINT = "/data/link-companies-checkpoint.json"
BATCH_SIZE = 200_000   # rows updated per commit
LOG_EVERY  = 1         # log after every batch

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Load checkpoint
    total_linked = 0
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT) as f:
            cp = json.load(f)
            total_linked = cp.get("total_linked", 0)
        print(f"Resuming — {total_linked:,} already linked")

    # Count unlinked
    cur.execute("""
        SELECT COUNT(*) FROM discover_people
        WHERE company_id IS NULL AND company_name IS NOT NULL
    """)
    remaining = cur.fetchone()[0]
    print(f"Unlinked people with company_name: {remaining:,}")

    t0 = time.time()
    batch = 0

    while True:
        # Link one batch: find unlinked people whose company_name matches a known company
        cur.execute(f"""
            WITH candidates AS (
                SELECT p.id AS person_id, c.id AS company_id
                FROM discover_people p
                JOIN discover_companies c
                  ON c.name_normalized = normalize_company(p.company_name)
                WHERE p.company_id IS NULL
                  AND p.company_name IS NOT NULL
                  AND c.name_normalized IS NOT NULL
                LIMIT {BATCH_SIZE}
            )
            UPDATE discover_people p
            SET company_id = candidates.company_id
            FROM candidates
            WHERE p.id = candidates.person_id
        """)
        linked_this_batch = cur.rowcount
        conn.commit()
        batch += 1

        if linked_this_batch == 0:
            break

        total_linked += linked_this_batch
        elapsed = time.time() - t0
        rate = total_linked / elapsed

        with open(CHECKPOINT, "w") as f:
            json.dump({"total_linked": total_linked}, f)

        print(f"  batch {batch} | +{linked_this_batch:,} | total {total_linked:,} | {rate:,.0f}/s", flush=True)

    # Final stats
    cur.execute("SELECT COUNT(*) FROM discover_people WHERE company_id IS NOT NULL")
    linked_total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM discover_people")
    grand_total  = cur.fetchone()[0]
    pct = linked_total / grand_total * 100 if grand_total else 0

    print(f"\nDone: {linked_total:,} / {grand_total:,} people linked ({pct:.1f}%)")
    print(f"Time: {(time.time()-t0)/60:.1f} min")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
