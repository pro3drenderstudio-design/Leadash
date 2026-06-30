#!/usr/bin/env python3
"""
Import People Data Labs (PDL) CSV chunks.
PDL columns: a (location), e (emails list), liid (linkedin slug), linkedin (URL), n (name), t (phones list)

Dedup strategy:
  - Has email  → ON CONFLICT email: enrich linkedin_url + phone if missing
  - No email, has linkedin → ON CONFLICT linkedin: enrich phone if missing
  - Neither → skip

Run on VPS: python3 /data/pdl/import-pdl.py
"""

import csv, os, json, re, time, uuid, ast, glob, sys
import psycopg2
from psycopg2.extras import execute_values

DB_URL     = "postgres://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"
PDL_DIR    = "/data/pdl/chunks"           # extracted CSV chunks land here
CHECKPOINT = "/data/pdl/checkpoint.json"
BATCH_SIZE = 8_000
LOG_EVERY  = 500_000

UPSERT_EMAIL = """
    INSERT INTO discover_people
      (id, first_name, last_name, email, linkedin_url, phone, country, state, city, source)
    VALUES %s
    ON CONFLICT (email) WHERE email IS NOT NULL AND email <> ''
    DO UPDATE SET
      linkedin_url = CASE WHEN EXCLUDED.linkedin_url IS NOT NULL AND discover_people.linkedin_url IS NULL
                         THEN EXCLUDED.linkedin_url ELSE discover_people.linkedin_url END,
      phone        = CASE WHEN EXCLUDED.phone IS NOT NULL AND discover_people.phone IS NULL
                         THEN EXCLUDED.phone        ELSE discover_people.phone END
"""

UPSERT_LINKEDIN = """
    INSERT INTO discover_people
      (id, first_name, last_name, email, linkedin_url, phone, country, state, city, source)
    VALUES %s
    ON CONFLICT (lower(linkedin_url)) WHERE linkedin_url IS NOT NULL
    DO UPDATE SET
      email = CASE WHEN EXCLUDED.email IS NOT NULL AND discover_people.email IS NULL
                   THEN EXCLUDED.email ELSE discover_people.email END,
      phone = CASE WHEN EXCLUDED.phone IS NOT NULL AND discover_people.phone IS NULL
                   THEN EXCLUDED.phone ELSE discover_people.phone END
"""

def parse_list(s):
    """Parse Python-repr list string like ['a@b.com', 'c@d.com'] → list of strings."""
    if not s or s in ("", "nan", "[]"):
        return []
    try:
        result = ast.literal_eval(s)
        if isinstance(result, list):
            return [str(x).strip() for x in result if x]
        return [str(result).strip()] if result else []
    except Exception:
        # fallback: strip brackets and split
        s = s.strip("[]").replace("'", "").replace('"', "")
        return [x.strip() for x in s.split(",") if x.strip()]

def parse_name(n):
    if not n:
        return None, None
    parts = n.strip().split(" ", 1)
    first = parts[0].title() if parts[0] else None
    last  = parts[1].title() if len(parts) > 1 and parts[1] else None
    return first, last

def parse_location(a):
    """'city, state, country' → (city, state, country). Handles 1-3 parts."""
    if not a:
        return None, None, None
    parts = [p.strip() for p in a.split(",")]
    if len(parts) >= 3:
        return parts[0] or None, parts[-2].strip() or None, parts[-1].strip() or None
    elif len(parts) == 2:
        return None, parts[0] or None, parts[1] or None
    else:
        return None, None, parts[0] or None

def valid_email(e):
    return bool(e and "@" in e and "." in e.split("@")[-1])

def clean_linkedin(url):
    if not url:
        return None
    url = url.strip()
    if not url.startswith("http"):
        url = "https://www.linkedin.com/in/" + url
    return url or None

def process_chunk(cur, filepath, start_row=0):
    inserted_email = 0
    inserted_li    = 0
    skipped        = 0
    row_idx        = 0

    email_batch   = []
    linkedin_batch = []

    def flush():
        nonlocal inserted_email, inserted_li
        if email_batch:
            # Deduplicate within batch — same email appearing twice causes ON CONFLICT error
            seen = {}
            for r in email_batch:
                key = r[3].lower() if r[3] else r[3]
                seen[key] = r
            deduped = list(seen.values())
            execute_values(cur, UPSERT_EMAIL, deduped)
            inserted_email += len(deduped)
            email_batch.clear()
        if linkedin_batch:
            seen = {}
            for r in linkedin_batch:
                key = r[4].lower() if r[4] else r[4]
                seen[key] = r
            deduped = list(seen.values())
            execute_values(cur, UPSERT_LINKEDIN, deduped)
            inserted_li += len(deduped)
            linkedin_batch.clear()

    with open(filepath, encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_idx += 1
            if row_idx <= start_row:
                continue

            emails   = parse_list(row.get("e", ""))
            phones   = parse_list(row.get("t", ""))
            linkedin = clean_linkedin(row.get("linkedin", ""))
            name     = row.get("n", "")
            location = row.get("a", "")

            email = next((e for e in emails if valid_email(e)), None)
            phone = phones[0] if phones else None
            first, last = parse_name(name)
            city, state, country = parse_location(location)

            rec = (str(uuid.uuid4()), first, last, email, linkedin, phone, country, state, city, "pdl")

            if email:
                email_batch.append(rec)
            elif linkedin:
                linkedin_batch.append(rec)
            else:
                skipped += 1
                continue

            if len(email_batch) + len(linkedin_batch) >= BATCH_SIZE:
                flush()

    flush()
    return inserted_email, inserted_li, skipped, row_idx

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Load checkpoint
    checkpoint = {}
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT) as f:
            checkpoint = json.load(f)
    done_files   = set(checkpoint.get("done_files", []))
    total_ins    = checkpoint.get("total_inserted", 0)
    total_skip   = checkpoint.get("total_skipped", 0)
    current_file = checkpoint.get("current_file", None)
    current_row  = checkpoint.get("current_row", 0)

    # Get sorted list of chunk CSVs
    chunks = sorted(glob.glob(os.path.join(PDL_DIR, "PeopleDataLabs_chunk_*.csv")))
    print(f"Found {len(chunks)} chunks. {len(done_files)} already done.")

    t0 = time.time()
    rows_since_log = 0

    for chunk in chunks:
        fname = os.path.basename(chunk)
        if fname in done_files:
            continue

        start_row = current_row if fname == current_file else 0
        print(f"  Processing {fname} (start_row={start_row:,})...")

        try:
            ie, il, sk, total_rows = process_chunk(cur, chunk, start_row)
            conn.commit()
        except Exception as ex:
            conn.rollback()
            print(f"  ERROR in {fname}: {ex}")
            # Save checkpoint at current state and exit
            with open(CHECKPOINT, "w") as f:
                json.dump({
                    "done_files":     list(done_files),
                    "total_inserted": total_ins,
                    "total_skipped":  total_skip,
                    "current_file":   fname,
                    "current_row":    start_row,
                }, f)
            sys.exit(1)

        done_files.add(fname)
        total_ins  += ie + il
        total_skip += sk
        current_file = None
        current_row  = 0
        rows_since_log += total_rows

        elapsed = time.time() - t0
        rate    = total_ins / elapsed if elapsed else 0
        print(f"  {fname}: {ie:,} by email | {il:,} by linkedin | {sk:,} skipped | total {total_ins:,} | {rate:,.0f}/s")

        # Save checkpoint after each chunk
        with open(CHECKPOINT, "w") as f:
            json.dump({
                "done_files":     list(done_files),
                "total_inserted": total_ins,
                "total_skipped":  total_skip,
                "current_file":   None,
                "current_row":    0,
            }, f)

    cur.close()
    conn.close()
    print(f"\nDone: {total_ins:,} inserted | {total_skip:,} skipped")

if __name__ == "__main__":
    main()
