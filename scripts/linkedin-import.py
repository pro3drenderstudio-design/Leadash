#!/usr/bin/env python3
"""
linkedin-import.py
Streams through the LinkedIn ZIP, enriches existing discover_people records
(matched by linkedin_url then email), and inserts new ones.

Skips the 'by State (USA)' folder to avoid duplicating US records
already in the 'by Countries' section.

Run:  nohup python3 -u linkedin-import.py >> /data/linkedin-import.log 2>&1 &
"""

import zipfile, csv, io, logging, sys, time, uuid
from psycopg2 import connect, OperationalError
from psycopg2.extras import execute_values

DB_URL   = "postgresql://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"
ZIP_PATH = "/data/Linkedin Database 434,832,484.zip"
LOG_FILE = "/data/linkedin-import.log"
BATCH    = 2000

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, mode="a"),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger()


# ── Helpers ───────────────────────────────────────────────────────────────────

def norm_li(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip().lower().rstrip("/")
    for prefix in ("https://www.", "http://www.", "https://", "http://"):
        if url.startswith(prefix):
            url = url[len(prefix):]
            break
    return url if url.startswith("linkedin.com/in/") else None


def norm_email(e: str | None) -> str | None:
    if not e:
        return None
    e = e.strip().lower().split(",")[0].strip()
    return e if "@" in e and "." in e.split("@")[1] else None


def safe(v, maxlen: int | None = None) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    return s[:maxlen] if maxlen else s


def parse_int(v) -> int | None:
    try:
        return int(str(v).replace(",", "").strip())
    except Exception:
        return None


def parse_row(row: dict) -> dict | None:
    li_url = norm_li(row.get("LinkedIn Url", ""))
    email  = norm_email(row.get("Emails", ""))
    if not li_url and not email:
        return None

    phone = safe(row.get("Mobile", "")) or safe(row.get("Phone numbers", ""))

    return {
        "linkedin_url":         li_url,
        "email":                email,
        "first_name":           safe(row.get("First Name", "")),
        "last_name":            safe(row.get("Last Name", "")),
        "title":                safe(row.get("Job title", "")),
        "sub_role":             safe(row.get("Sub Role", "")),
        "gender":               safe(row.get("Gender", "")),
        "birth_year":           parse_int(row.get("Birth Year", "")),
        "skills":               safe(row.get("Skills", ""), 2000),
        "summary":              safe(row.get("Summary", ""), 2000),
        "job_summary":          safe(row.get("Job Summary", ""), 1000),
        "inferred_salary":      safe(row.get("Inferred Salary", "")),
        "years_experience":     parse_int(row.get("Years Experience", "")),
        "linkedin_connections": parse_int(row.get("Linkedin Connections", "")),
        "phone":                phone,
        "country":              safe(row.get("Location Country", "") or row.get("Location", "")),
        "state":                safe(row.get("Region", "")),
        "city":                 safe(row.get("Locality", "")),
        "company_name":         safe(row.get("Company Name", "")),
        "company_size":         safe(row.get("Company Size", "")),
        "facebook_url":         safe(row.get("Facebook Url", "")),
        "twitter_url":          safe(row.get("Twitter Url", "")),
        "github_url":           safe(row.get("Github Url", "")),
        "interests":            safe(row.get("Interests", ""), 1000),
        "start_date":           safe(row.get("Start Date", "")),
    }


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn():
    con = connect(DB_URL)
    con.autocommit = False
    cur = con.cursor()
    cur.execute("SET work_mem = '1GB'")
    cur.execute("SET synchronous_commit = 'off'")
    con.commit()
    return con


UPDATE_BY_LI = """
    UPDATE discover_people dp SET
        sub_role             = COALESCE(dp.sub_role,             d.sub_role),
        gender               = COALESCE(dp.gender,               d.gender),
        birth_year           = COALESCE(dp.birth_year,           d.birth_year::smallint),
        skills               = COALESCE(dp.skills,               d.skills),
        summary              = COALESCE(dp.summary,              d.summary),
        job_summary          = COALESCE(dp.job_summary,          d.job_summary),
        inferred_salary      = COALESCE(dp.inferred_salary,      d.inferred_salary),
        years_experience     = COALESCE(dp.years_experience,     d.years_experience::smallint),
        linkedin_connections = COALESCE(dp.linkedin_connections, d.linkedin_connections::int),
        phone                = COALESCE(dp.phone,                d.phone),
        facebook_url         = COALESCE(dp.facebook_url,         d.facebook_url),
        twitter_url          = COALESCE(dp.twitter_url,          d.twitter_url),
        github_url           = COALESCE(dp.github_url,           d.github_url),
        interests            = COALESCE(dp.interests,            d.interests),
        start_date           = COALESCE(dp.start_date,           d.start_date),
        email                = COALESCE(dp.email,                d.email),
        email_alts           = CASE
            WHEN d.email IS NOT NULL
             AND dp.email IS NOT NULL
             AND lower(d.email) != lower(dp.email)
             AND NOT (lower(d.email) = ANY(COALESCE(dp.email_alts, '{}'::text[])))
            THEN array_append(COALESCE(dp.email_alts, '{}'::text[]), lower(d.email))
            ELSE dp.email_alts
        END,
        country              = COALESCE(dp.country,              d.country),
        state                = COALESCE(dp.state,                d.state),
        city                 = COALESCE(dp.city,                 d.city)
    FROM (VALUES %s) AS d(
        linkedin_url, sub_role, gender, birth_year, skills, summary,
        job_summary, inferred_salary, years_experience, linkedin_connections,
        phone, facebook_url, twitter_url, github_url, interests, start_date,
        email, country, state, city
    )
    WHERE lower(dp.linkedin_url) = d.linkedin_url
"""

UPDATE_BY_EMAIL = """
    UPDATE discover_people dp SET
        linkedin_url         = COALESCE(dp.linkedin_url,         d.linkedin_url),
        sub_role             = COALESCE(dp.sub_role,             d.sub_role),
        gender               = COALESCE(dp.gender,               d.gender),
        birth_year           = COALESCE(dp.birth_year,           d.birth_year::smallint),
        skills               = COALESCE(dp.skills,               d.skills),
        summary              = COALESCE(dp.summary,              d.summary),
        job_summary          = COALESCE(dp.job_summary,          d.job_summary),
        inferred_salary      = COALESCE(dp.inferred_salary,      d.inferred_salary),
        years_experience     = COALESCE(dp.years_experience,     d.years_experience::smallint),
        linkedin_connections = COALESCE(dp.linkedin_connections, d.linkedin_connections::int),
        phone                = COALESCE(dp.phone,                d.phone),
        facebook_url         = COALESCE(dp.facebook_url,         d.facebook_url),
        twitter_url          = COALESCE(dp.twitter_url,          d.twitter_url),
        github_url           = COALESCE(dp.github_url,           d.github_url),
        interests            = COALESCE(dp.interests,            d.interests),
        start_date           = COALESCE(dp.start_date,           d.start_date),
        country              = COALESCE(dp.country,              d.country),
        state                = COALESCE(dp.state,                d.state),
        city                 = COALESCE(dp.city,                 d.city)
    FROM (VALUES %s) AS d(
        email, linkedin_url, sub_role, gender, birth_year, skills, summary,
        job_summary, inferred_salary, years_experience, linkedin_connections,
        phone, facebook_url, twitter_url, github_url, interests, start_date,
        country, state, city
    )
    WHERE lower(dp.email) = d.email AND dp.linkedin_url IS NULL
"""

INSERT_SQL = """
    INSERT INTO discover_people (
        id, first_name, last_name, title, sub_role, gender, birth_year,
        skills, summary, job_summary, inferred_salary, years_experience,
        linkedin_connections, email, phone, linkedin_url, country, state, city,
        company_name, facebook_url, twitter_url, github_url, interests, start_date, source
    ) VALUES %s
    ON CONFLICT DO NOTHING
"""


def flush(cur, con, li_batch, email_batch, insert_batch, stats):
    if li_batch:
        execute_values(cur, UPDATE_BY_LI, [
            (
                r["linkedin_url"], r["sub_role"], r["gender"], r["birth_year"],
                r["skills"], r["summary"], r["job_summary"], r["inferred_salary"],
                r["years_experience"], r["linkedin_connections"], r["phone"],
                r["facebook_url"], r["twitter_url"], r["github_url"],
                r["interests"], r["start_date"],
                r["email"], r["country"], r["state"], r["city"],
            )
            for r in li_batch
        ])
        stats["updated_li"] += len(li_batch)
        li_batch.clear()

    if email_batch:
        execute_values(cur, UPDATE_BY_EMAIL, [
            (
                r["email"], r["linkedin_url"], r["sub_role"], r["gender"], r["birth_year"],
                r["skills"], r["summary"], r["job_summary"], r["inferred_salary"],
                r["years_experience"], r["linkedin_connections"], r["phone"],
                r["facebook_url"], r["twitter_url"], r["github_url"],
                r["interests"], r["start_date"],
                r["country"], r["state"], r["city"],
            )
            for r in email_batch
        ])
        stats["updated_email"] += len(email_batch)
        email_batch.clear()

    if insert_batch:
        execute_values(cur, INSERT_SQL, [
            (
                str(uuid.uuid4()),
                r["first_name"], r["last_name"], r["title"], r["sub_role"],
                r["gender"], r["birth_year"], r["skills"], r["summary"],
                r["job_summary"], r["inferred_salary"], r["years_experience"],
                r["linkedin_connections"], r["email"], r["phone"], r["linkedin_url"],
                r["country"], r["state"], r["city"], r["company_name"],
                r["facebook_url"], r["twitter_url"], r["github_url"],
                r["interests"], r["start_date"], "linkedin",
            )
            for r in insert_batch
        ])
        stats["inserted"] += len(insert_batch)
        insert_batch.clear()

    con.commit()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("=== LinkedIn import starting ===")
    log.info(f"ZIP: {ZIP_PATH}")

    con = get_conn()
    cur = con.cursor()

    log.info("Columns ready (pre-applied).")

    stats = {"updated_li": 0, "updated_email": 0, "inserted": 0, "skipped": 0, "total": 0}
    li_batch, email_batch, insert_batch = [], [], []
    last_log = time.time()
    file_num = 0

    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        entries = [e for e in zf.infolist() if e.filename.endswith(".csv")]
        log.info(f"Found {len(entries)} CSV files in ZIP.")

        for entry in entries:
            # Skip US-by-state to avoid duplicates (US is in the Countries section)
            if "by State (USA)" in entry.filename:
                continue

            country_name = entry.filename.split("/")[-1].replace(".csv", "")
            file_num += 1
            log.info(f"[{file_num}] Processing: {country_name} ({entry.file_size / 1e6:.0f} MB)")

            try:
                with zf.open(entry) as raw:
                    text = io.TextIOWrapper(raw, encoding="utf-8", errors="replace")
                    reader = csv.DictReader(text)

                    for row in reader:
                        stats["total"] += 1
                        rec = parse_row(row)
                        if not rec:
                            stats["skipped"] += 1
                            continue

                        if rec["linkedin_url"]:
                            li_batch.append(rec)
                        elif rec["email"]:
                            email_batch.append(rec)
                        else:
                            stats["skipped"] += 1
                            continue

                        insert_batch.append(rec)

                        if len(li_batch) + len(email_batch) >= BATCH:
                            flush(cur, con, li_batch, email_batch, insert_batch, stats)

                        # Log progress every 30 seconds
                        if time.time() - last_log >= 30:
                            log.info(
                                f"  total={stats['total']:,}  "
                                f"upd_li={stats['updated_li']:,}  "
                                f"upd_email={stats['updated_email']:,}  "
                                f"inserted={stats['inserted']:,}"
                            )
                            last_log = time.time()

            except Exception as e:
                log.error(f"  Error in {country_name}: {e}")
                con.rollback()
                # reconnect and continue
                try:
                    con = get_conn()
                    cur = con.cursor()
                    li_batch.clear(); email_batch.clear(); insert_batch.clear()
                except Exception as e2:
                    log.error(f"  Reconnect failed: {e2}")
                continue

        # Flush remaining
        flush(cur, con, li_batch, email_batch, insert_batch, stats)

    log.info("=== LinkedIn import complete ===")
    log.info(
        f"  total_rows={stats['total']:,}  "
        f"updated_by_li={stats['updated_li']:,}  "
        f"updated_by_email={stats['updated_email']:,}  "
        f"inserted_new={stats['inserted']:,}  "
        f"skipped={stats['skipped']:,}"
    )
    cur.close()
    con.close()


if __name__ == "__main__":
    main()
