"""
Import standard Apollo CSV exports (comma-separated) into discover_companies + discover_people.

Handles two formats:
  A) Full export  (~60 cols): AgTech files, apollo-contacts-export, etc.
  B) Short export (~18 cols): Fresh Apollo Leads formatted files

Run on VPS:
  python3 /data/import-apollo-export.py /data/apollo-exports/*.csv
  python3 /data/import-apollo-export.py /data/apollo-exports/fresh/*.csv

Requires: psycopg2-binary  (pip3 install psycopg2-binary)
"""
import sys, csv, os, time, re, glob
import psycopg2, psycopg2.extras
csv.field_size_limit(10 * 1024 * 1024)

DSN        = "host=localhost port=5432 dbname=leadash_leads user=leadash_user password='U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0'"
BATCH_SIZE = 2000
LOG_EVERY  = 10_000

# ── Full export column indices (60+ cols, comma-sep, quoted) ──────────────────
FE_FIRST   = 0
FE_LAST    = 1
FE_TITLE   = 2
FE_COMPANY = 3
FE_EMAIL   = 5
FE_STATUS  = 6
FE_SENIOR  = 7
FE_DEPT    = 8
FE_PHONE   = 9   # First Phone
FE_EMPS    = 16  # # Employees
FE_IND     = 17  # Industry
FE_KW      = 18  # Keywords
FE_LI_P    = 19  # Person Linkedin Url
FE_WEBSITE = 20  # Website
FE_LI_CO   = 21  # Company Linkedin Url
FE_CITY    = 24  # City (person)
FE_STATE   = 25  # State (person)
FE_COUNTRY = 26  # Country (person)
FE_CO_CITY = 28  # Company City
FE_CO_ST   = 29  # Company State
FE_CO_CTR  = 30  # Company Country
FE_DESC    = 32  # SEO Description
FE_REVENUE = 34  # Annual Revenue
FE_FUNDING = 35  # Total Funding
FE_P_ID    = 45  # Apollo Contact Id
FE_CO_ID   = 46  # Apollo Account Id

# ── Short export column indices (18-19 cols, comma-sep, quoted) ───────────────
SE_FIRST   = 0
SE_LAST    = 1
SE_TITLE   = 2
SE_COMPANY = 3
SE_WEBSITE = 4
SE_EMAIL   = 5
SE_PHONE   = 6
SE_EMPS    = 8
SE_LI_P    = 9
SE_LI_CO   = 10
SE_COUNTRY = 13
SE_IND     = 14
SE_KW      = 16
SE_DESC    = 17

# ── Helpers ───────────────────────────────────────────────────────────────────

def safe(row, idx, default=None):
    try:
        v = row[idx].strip()
        return v if v else default
    except IndexError:
        return default

def domain_from_url(url):
    if not url:
        return None
    url = re.sub(r'^https?://', '', url.strip().lower())
    url = url.split('/')[0].split('?')[0]
    return url.strip('www.') or None

def norm_email_status(raw):
    r = (raw or "").strip().lower()
    if r in ("verified", "valid"):    return "verified"
    if r in ("extrapolated",):        return "extrapolated"
    return "unverified"

def parse_employees(raw):
    if not raw:
        return None, None
    raw = raw.strip().replace(',', '')
    # Handle ranges like "51-200"
    m = re.match(r'^(\d+)-?(\d+)?$', raw)
    if m:
        lo = int(m.group(1))
        hi = int(m.group(2)) if m.group(2) else lo
        mid = (lo + hi) // 2
        if lo <= 10:      return mid, "1-10"
        if lo <= 50:      return mid, "11-50"
        if lo <= 200:     return mid, "51-200"
        if lo <= 500:     return mid, "201-500"
        if lo <= 1000:    return mid, "501-1000"
        if lo <= 5000:    return mid, "1001-5000"
        if lo <= 10000:   return mid, "5001-10000"
        return mid, "10001+"
    try:
        n = int(float(raw))
        if n <= 10:       return n, "1-10"
        if n <= 50:       return n, "11-50"
        if n <= 200:      return n, "51-200"
        if n <= 500:      return n, "201-500"
        if n <= 1000:     return n, "501-1000"
        if n <= 5000:     return n, "1001-5000"
        if n <= 10000:    return n, "5001-10000"
        return n, "10001+"
    except (ValueError, TypeError):
        return None, None

def detect_format(header_row):
    """Return 'full' (60-col) or 'short' (18-col) based on header."""
    if len(header_row) > 30 or any("Company Linkedin" in c or "Apollo Contact" in c for c in header_row):
        return "full"
    return "short"

def extract_row(row, fmt):
    """Return (company_dict, person_dict) from a parsed row."""
    if fmt == "full":
        emp_count, size_range = parse_employees(safe(row, FE_EMPS))
        company = dict(
            name        = safe(row, FE_COMPANY, "")[:500],
            domain      = domain_from_url(safe(row, FE_WEBSITE)),
            website_url = safe(row, FE_WEBSITE, "")[:1000],
            linkedin_url= safe(row, FE_LI_CO, "")[:500],
            industry    = safe(row, FE_IND, "")[:200],
            keywords    = safe(row, FE_KW),
            description = safe(row, FE_DESC),
            size_range  = size_range,
            employee_count = emp_count,
            country     = safe(row, FE_CO_CTR),
            state       = safe(row, FE_CO_ST),
            city        = safe(row, FE_CO_CITY),
            source_id   = safe(row, FE_CO_ID),
        )
        try:
            rev = int(float(safe(row, FE_REVENUE, "0") or "0"))
        except (ValueError, TypeError):
            rev = None
        try:
            fund = int(float(safe(row, FE_FUNDING, "0") or "0"))
        except (ValueError, TypeError):
            fund = None
        company["revenue_usd"]   = rev or None
        company["funding_total"] = fund or None

        person = dict(
            first_name   = safe(row, FE_FIRST, "")[:200],
            last_name    = safe(row, FE_LAST, "")[:200],
            title        = safe(row, FE_TITLE, "")[:500],
            email        = (safe(row, FE_EMAIL) or "").lower().strip(),
            email_status = norm_email_status(safe(row, FE_STATUS)),
            seniority    = (safe(row, FE_SENIOR) or "").lower()[:100],
            department   = safe(row, FE_DEPT, "")[:200],
            phone        = safe(row, FE_PHONE, "")[:50],
            linkedin_url = safe(row, FE_LI_P, "")[:500],
            country      = safe(row, FE_COUNTRY),
            state        = safe(row, FE_STATE),
            city         = safe(row, FE_CITY),
            company_name = company["name"],
            source_id    = safe(row, FE_P_ID),
        )
    else:  # short format
        emp_count, size_range = parse_employees(safe(row, SE_EMPS))
        company = dict(
            name        = safe(row, SE_COMPANY, "")[:500],
            domain      = domain_from_url(safe(row, SE_WEBSITE)),
            website_url = safe(row, SE_WEBSITE, "")[:1000],
            linkedin_url= safe(row, SE_LI_CO, "")[:500],
            industry    = safe(row, SE_IND, "")[:200],
            keywords    = safe(row, SE_KW),
            description = safe(row, SE_DESC),
            size_range  = size_range,
            employee_count = emp_count,
            country     = safe(row, SE_COUNTRY),
            state       = None,
            city        = None,
            source_id   = None,
            revenue_usd = None,
            funding_total = None,
        )
        person = dict(
            first_name   = safe(row, SE_FIRST, "")[:200],
            last_name    = safe(row, SE_LAST, "")[:200],
            title        = safe(row, SE_TITLE, "")[:500],
            email        = (safe(row, SE_EMAIL) or "").lower().strip(),
            email_status = "unverified",
            seniority    = None,
            department   = None,
            phone        = safe(row, SE_PHONE, "")[:50],
            linkedin_url = safe(row, SE_LI_P, "")[:500],
            country      = safe(row, SE_COUNTRY),
            state        = None,
            city         = None,
            company_name = company["name"],
            source_id    = None,
        )
    return company, person

# ── Two-pass import ───────────────────────────────────────────────────────────

def import_files(filepaths):
    conn = psycopg2.connect(DSN)
    cur  = conn.cursor()
    t0   = time.time()

    # Pre-load existing company domains and source_ids to avoid duplicate inserts
    print("Loading existing company map from DB...")
    cur.execute("SELECT domain, id FROM discover_companies WHERE domain IS NOT NULL AND domain <> ''")
    domain_map = {r[0]: r[1] for r in cur.fetchall()}
    cur.execute("SELECT source_id, id FROM discover_companies WHERE source_id IS NOT NULL AND source = 'apollo'")
    source_map = {r[0]: r[1] for r in cur.fetchall()}
    print(f"  {len(domain_map):,} domains, {len(source_map):,} apollo source_ids loaded\n")

    total_co_ins = total_co_skip = 0
    total_p_ins  = total_p_skip  = 0

    for filepath in filepaths:
        fname = os.path.basename(filepath)
        print(f"\n{'='*60}")
        print(f"  File: {fname}")

        with open(filepath, encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
            except StopIteration:
                print("  Empty file, skipping"); continue
            fmt = detect_format(header)
            print(f"  Format: {fmt} ({len(header)} columns)")

            co_batch = []
            p_batch  = []
            rows_processed = 0

            for row in reader:
                if not any(row):
                    continue
                co, pe = extract_row(row, fmt)
                rows_processed += 1

                # ── Company upsert ────────────────────────────────────────
                co_name = co["name"]
                if co_name:
                    co_domain   = co.get("domain")
                    co_source   = co.get("source_id")
                    existing_id = (
                        source_map.get(co_source) if co_source else None
                    ) or (
                        domain_map.get(co_domain) if co_domain else None
                    )

                    if not existing_id:
                        co_batch.append((
                            co_name, co_domain, co.get("website_url"),
                            co.get("linkedin_url"), co.get("industry"),
                            co.get("keywords"), co.get("description"),
                            co.get("size_range"), co.get("employee_count"),
                            co.get("country"), co.get("state"), co.get("city"),
                            co.get("revenue_usd"), co.get("funding_total"),
                            "apollo", co_source,
                        ))

                # ── Person insert ─────────────────────────────────────────
                email = pe.get("email")
                if email and "@" in email:
                    # Look up company_id (will be None for new companies until after batch)
                    co_id = (
                        source_map.get(co.get("source_id")) if co.get("source_id") else None
                    ) or (
                        domain_map.get(co.get("domain")) if co.get("domain") else None
                    )
                    p_batch.append((
                        co_id, pe.get("company_name"),
                        pe.get("first_name"), pe.get("last_name"),
                        pe.get("title"), pe.get("seniority"), pe.get("department"),
                        pe.get("linkedin_url"), email, pe.get("email_status"),
                        pe.get("phone"), pe.get("country"), pe.get("state"), pe.get("city"),
                        "apollo", pe.get("source_id"),
                    ))

                # ── Flush company batch ───────────────────────────────────
                if len(co_batch) >= BATCH_SIZE:
                    rows_inserted = _flush_companies(cur, conn, co_batch, domain_map, source_map)
                    total_co_ins += rows_inserted
                    total_co_skip += len(co_batch) - rows_inserted
                    co_batch.clear()

                # ── Flush people batch ────────────────────────────────────
                if len(p_batch) >= BATCH_SIZE:
                    rows_inserted = _flush_people(cur, conn, p_batch)
                    total_p_ins += rows_inserted
                    total_p_skip += len(p_batch) - rows_inserted
                    p_batch.clear()

                if rows_processed % LOG_EVERY == 0:
                    elapsed = time.time() - t0
                    print(f"  {rows_processed:>8,} rows | co: +{total_co_ins:,} | people: +{total_p_ins:,} | {elapsed/60:.1f}min")

        # Flush remaining
        if co_batch:
            ins = _flush_companies(cur, conn, co_batch, domain_map, source_map)
            total_co_ins += ins; total_co_skip += len(co_batch) - ins
        if p_batch:
            ins = _flush_people(cur, conn, p_batch)
            total_p_ins += ins; total_p_skip += len(p_batch) - ins

        print(f"  Done: {rows_processed:,} rows processed")

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"COMPLETE in {elapsed/60:.1f} min")
    print(f"  Companies: {total_co_ins:,} inserted, {total_co_skip:,} skipped")
    print(f"  People:    {total_p_ins:,} inserted, {total_p_skip:,} skipped")
    cur.close(); conn.close()

def _flush_companies(cur, conn, batch, domain_map, source_map):
    try:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO discover_companies
                (name, domain, website_url, linkedin_url, industry,
                 keywords, description, size_range, employee_count,
                 country, state, city, revenue_usd, funding_total,
                 source, source_id)
            VALUES %s
            ON CONFLICT DO NOTHING
            RETURNING id, domain, source_id
        """, batch)
        rows = cur.fetchall()
        conn.commit()
        for co_id, dom, src_id in rows:
            if dom:  domain_map[dom]    = co_id
            if src_id: source_map[src_id] = co_id
        return len(rows)
    except Exception as e:
        conn.rollback()
        print(f"  [co batch error] {e}")
        return 0

def _flush_people(cur, conn, batch):
    try:
        before = cur.rowcount
        psycopg2.extras.execute_values(cur, """
            INSERT INTO discover_people
                (company_id, company_name,
                 first_name, last_name, title, seniority, department,
                 linkedin_url, email, email_status, phone,
                 country, state, city, source, source_id)
            VALUES %s
            ON CONFLICT (email) WHERE email IS NOT NULL AND email <> '' DO NOTHING
        """, batch)
        inserted = cur.rowcount
        conn.commit()
        return max(inserted, 0)
    except Exception as e:
        conn.rollback()
        print(f"  [people batch error] {e}")
        return 0

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    patterns = sys.argv[1:]
    if not patterns:
        print("Usage: python3 import-apollo-export.py <glob_or_file> [...]")
        sys.exit(1)

    filepaths = []
    for p in patterns:
        expanded = glob.glob(p)
        filepaths.extend(expanded if expanded else [p])

    filepaths = [f for f in filepaths if os.path.isfile(f)]
    if not filepaths:
        print("No files found"); sys.exit(1)

    print(f"Files to import ({len(filepaths)}):")
    for f in filepaths:
        print(f"  {os.path.basename(f)}  ({os.path.getsize(f)/1e6:.1f} MB)")
    print()

    import_files(filepaths)
