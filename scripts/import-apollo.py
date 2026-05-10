"""
Apollo database import — runs ON the VPS, reads local TSV files, inserts into PostgreSQL.

Files:
  Apollo_V7_V5_org_all_fields 6,071,657.csv   (tab-separated, 10GB)
  Apollo_V7_V5_per_all_fields 93,239,628.csv  (tab-separated, 54GB)

Usage (run on VPS after copying files there):
  python3 import-apollo.py orgs  /data/apollo/Apollo_V7_V5_org_all_fields*.csv
  python3 import-apollo.py people /data/apollo/Apollo_V7_V5_per_all_fields*.csv

Requires: psycopg2  ->  pip3 install psycopg2-binary
"""
import sys
import csv
import time
import json
import os
import psycopg2
import psycopg2.extras

# ── Config ─────────────────────────────────────────────────────────────────────
DSN = "host=localhost port=5432 dbname=leadash_leads user=leadash_user password='Ld!Disc0ver2026'"
BATCH_SIZE    = 2000
CHECKPOINT    = "/data/apollo/checkpoint-{mode}.json"

# Column indices for people TSV (0-based)
# person_name(0) first(1) last(2) name_down(3) title(4) functions(5) seniority(6)
# email_status(7) confidence(8) email(9) phone(10) sanitized_phone(11)
# email_analyzed(12) linkedin_url(13) detailed_function(14) title_norm(15)
# primary_title_norm(16) org_name(17) city(18) city_state(19) state(20)
# state_country(21) country(22) postal(23) job_start(24) org_ids(25) ...
P_FIRST       = 1
P_LAST        = 2
P_TITLE       = 4
P_SENIORITY   = 6
P_EMAIL_STATUS= 7
P_EMAIL       = 9
P_PHONE       = 11   # sanitized_phone
P_LINKEDIN    = 13
P_DEPARTMENT  = 14   # detailed_function
P_ORG_NAME    = 17
P_CITY        = 18
P_STATE       = 20
P_COUNTRY     = 22
P_ORG_IDS     = 25
P_SOURCE_ID   = 37   # _id

# Column indices for org TSV (0-based)
O_ORG_ID      = 0
O_NAME        = 1
O_REVENUE     = 2
O_EMPLOYEES   = 8
O_INDUSTRIES  = 11
O_WEBSITE     = 21
O_DOMAIN      = 29
O_PHONE       = 31
O_SIZE_TAG    = 5    # organization_linkedin_company_size_tag_ids (tag id maps to size)
O_CITY        = 36
O_STATE       = 38
O_COUNTRY     = 40
O_FUNDING     = 43
O_FUND_STAGE  = 44
O_LINKEDIN    = 27   # organization_linkedin_numerical_urls → "[['http://...linkedin.com/company/ID']]"
O_SOURCE_ID   = 49   # _id (MongoDB ObjectID)

def parse_size(employee_count_raw):
    try:
        n = int(float(employee_count_raw)) if employee_count_raw else 0
    except (ValueError, TypeError):
        return None
    if n >= 10001: return "10001+"
    if n >= 5001:  return "5001-10000"
    if n >= 1001:  return "1001-5000"
    if n >= 501:   return "501-1000"
    if n >= 201:   return "201-500"
    if n >= 51:    return "51-200"
    if n >= 11:    return "11-50"
    if n >= 1:     return "1-10"
    return None

def parse_org_ids(raw):
    if not raw:
        return None
    import re
    ids = re.findall(r"'([a-f0-9]{24})'", raw)
    return ids[0] if ids else None

def parse_linkedin_org(raw):
    if not raw:
        return None
    import re
    m = re.search(r"https?://[^\s'\"\\]+linkedin\.com/company/\d+", raw)
    return m.group(0) if m else None

def safe(row, idx, default=None):
    try:
        v = row[idx].strip()
        return v if v else default
    except IndexError:
        return default

def load_checkpoint(mode):
    path = CHECKPOINT.format(mode=mode)
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {"lines": 0, "inserted": 0, "skipped": 0}

def save_checkpoint(mode, data):
    path = CHECKPOINT.format(mode=mode)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f)

# ── Orgs import ────────────────────────────────────────────────────────────────

def import_orgs(filepath):
    cp = load_checkpoint("orgs")
    skip_lines = cp["lines"]
    total_inserted = cp["inserted"]
    total_skipped = cp["skipped"]

    conn = psycopg2.connect(DSN)
    cur  = conn.cursor()

    batch = []
    lines = 0
    t0 = time.time()
    t_chunk = time.time()

    print(f"\n Apollo Orgs Import")
    print(f"  Resuming from line {skip_lines:,} | {total_inserted:,} already inserted\n")

    with open(filepath, encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        for i, row in enumerate(reader):
            if i == 0:
                continue  # header
            if i <= skip_lines:
                continue

            lines += 1
            name = safe(row, O_NAME)
            if not name:
                total_skipped += 1
                continue

            domain   = safe(row, O_DOMAIN)
            website  = safe(row, O_WEBSITE)
            industry_raw = safe(row, O_INDUSTRIES)
            industry = industry_raw.strip("[]'\"").split(",")[0].strip().strip("'") if industry_raw else None
            size     = parse_size(safe(row, O_EMPLOYEES))
            city     = safe(row, O_CITY)
            state    = safe(row, O_STATE)
            country  = safe(row, O_COUNTRY)
            employees_raw = safe(row, O_EMPLOYEES)
            employees = int(employees_raw) if employees_raw and employees_raw.isdigit() else None
            revenue_raw = safe(row, O_REVENUE)
            revenue = int(float(revenue_raw) * 1000) if revenue_raw else None
            funding_raw = safe(row, O_FUNDING)
            funding = int(funding_raw) if funding_raw and funding_raw.isdigit() else None
            fund_stage = safe(row, O_FUND_STAGE)
            linkedin   = parse_linkedin_org(safe(row, O_LINKEDIN))
            source_id  = safe(row, O_SOURCE_ID)

            batch.append((
                name, domain, website, industry, size, employees,
                country, state, city, revenue, funding, fund_stage,
                linkedin, "apollo", source_id
            ))

            if len(batch) >= BATCH_SIZE:
                psycopg2.extras.execute_values(cur, """
                    INSERT INTO discover_companies
                        (name, domain, website_url, industry, size_range, employee_count,
                         country, state, city, revenue_usd, funding_total, funding_stage,
                         linkedin_url, source, source_id)
                    VALUES %s
                    ON CONFLICT DO NOTHING
                """, batch)
                conn.commit()
                total_inserted += len(batch)
                batch.clear()

                elapsed = time.time() - t0
                rate = total_inserted / elapsed
                print(f"  line {i:>9,} | {total_inserted:>8,} inserted | {total_skipped:>7,} skipped | {rate:.0f} rows/s")
                save_checkpoint("orgs", {"lines": i, "inserted": total_inserted, "skipped": total_skipped})

    if batch:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO discover_companies
                (name, domain, website_url, industry, size_range, employee_count,
                 country, state, city, revenue_usd, funding_total, funding_stage,
                 linkedin_url, source, source_id)
            VALUES %s
            ON CONFLICT DO NOTHING
        """, batch)
        conn.commit()
        total_inserted += len(batch)

    save_checkpoint("orgs", {"lines": lines + skip_lines, "inserted": total_inserted, "skipped": total_skipped})
    print(f"\n Done: {total_inserted:,} orgs inserted")
    cur.close(); conn.close()

# ── People import ──────────────────────────────────────────────────────────────

def import_people(filepath):
    cp = load_checkpoint("people")
    skip_lines = cp["lines"]
    total_inserted = cp["inserted"]
    total_skipped = cp["skipped"]

    conn = psycopg2.connect(DSN)
    cur  = conn.cursor()

    # Build source_id → company_id map for linking (load into memory, ~6M entries ~600MB)
    # Skip if too slow — company_name fallback is fine for MVP
    print("  Building org source_id map... (this may take a minute)")
    cur.execute("SELECT source_id, id FROM discover_companies WHERE source = 'apollo' AND source_id IS NOT NULL")
    org_map = {row[0]: row[1] for row in cur.fetchall()}
    print(f"  Loaded {len(org_map):,} orgs into map")

    batch = []
    t0 = time.time()

    print(f"\n Apollo People Import")
    print(f"  Resuming from line {skip_lines:,} | {total_inserted:,} already inserted\n")

    with open(filepath, encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        for i, row in enumerate(reader):
            if i == 0:
                continue
            if i <= skip_lines:
                continue

            email = safe(row, P_EMAIL)
            if not email or "@" not in email:
                total_skipped += 1
                continue

            first     = safe(row, P_FIRST)
            last      = safe(row, P_LAST)
            title     = safe(row, P_TITLE)
            seniority = safe(row, P_SENIORITY)
            dept      = safe(row, P_DEPARTMENT)
            linkedin  = safe(row, P_LINKEDIN)
            phone     = safe(row, P_PHONE)
            city      = safe(row, P_CITY)
            state     = safe(row, P_STATE)
            country   = safe(row, P_COUNTRY)
            org_name  = safe(row, P_ORG_NAME)
            source_id = safe(row, P_SOURCE_ID)

            # Map email_status
            raw_status = safe(row, P_EMAIL_STATUS, "")
            if raw_status == "Verified":
                email_status = "verified"
            elif raw_status == "Extrapolated":
                email_status = "extrapolated"
            else:
                email_status = "unverified"

            # Resolve company_id
            raw_org_ids = safe(row, P_ORG_IDS)
            apollo_org_id = parse_org_ids(raw_org_ids)
            company_id = org_map.get(apollo_org_id) if apollo_org_id else None

            batch.append((
                company_id, org_name,
                first, last, title, seniority, dept,
                linkedin, email.lower().strip(), email_status, phone,
                country, state, city,
                "apollo", source_id
            ))

            if len(batch) >= BATCH_SIZE:
                psycopg2.extras.execute_values(cur, """
                    INSERT INTO discover_people
                        (company_id, company_name,
                         first_name, last_name, title, seniority, department,
                         linkedin_url, email, email_status, phone,
                         country, state, city,
                         source, source_id)
                    VALUES %s
                    ON CONFLICT (email) WHERE email IS NOT NULL AND email <> '' DO NOTHING
                """, batch)
                conn.commit()
                total_inserted += len(batch)
                batch.clear()

                elapsed = time.time() - t0
                rate = total_inserted / max(elapsed, 1)
                eta  = int((93_000_000 - total_inserted - skip_lines) / max(rate, 1) / 60)
                print(f"  line {i:>9,} | {total_inserted:>9,} inserted | {total_skipped:>9,} skipped | {rate:.0f}/s | ETA ~{eta}min")
                save_checkpoint("people", {"lines": i, "inserted": total_inserted, "skipped": total_skipped})

    if batch:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO discover_people
                (company_id, company_name,
                 first_name, last_name, title, seniority, department,
                 linkedin_url, email, email_status, phone,
                 country, state, city,
                 source, source_id)
            VALUES %s
            ON CONFLICT (email) WHERE email IS NOT NULL AND email <> '' DO NOTHING
        """, batch)
        conn.commit()
        total_inserted += len(batch)

    save_checkpoint("people", {"lines": lines if 'lines' in dir() else 0, "inserted": total_inserted, "skipped": total_skipped})
    print(f"\n Done: {total_inserted:,} people inserted")
    cur.close(); conn.close()

# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 import-apollo.py [orgs|people] <filepath>")
        sys.exit(1)

    mode, filepath = sys.argv[1], sys.argv[2]
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)

    if mode == "orgs":
        import_orgs(filepath)
    elif mode == "people":
        import_people(filepath)
    else:
        print("Mode must be 'orgs' or 'people'")
        sys.exit(1)
