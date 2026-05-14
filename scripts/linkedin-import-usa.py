#!/usr/bin/env python3
"""
linkedin-import-usa.py
Imports only the main USA.csv from the LinkedIn ZIP (by Countries folder).
Fixes: birth_year and years_experience clamped to smallint range.
Run: nohup python3 -u /data/linkedin-import-usa.py >> /data/linkedin-import-usa.log 2>&1 &
"""
import zipfile, csv, io, logging, sys, time, uuid
from psycopg2 import connect
from psycopg2.extras import execute_values

DB_URL   = "postgresql://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"
ZIP_PATH = "/data/Linkedin Database 434,832,484.zip"
LOG_FILE = "/data/linkedin-import-usa.log"
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


def norm_li(url):
    if not url: return None
    url = url.strip().lower().rstrip("/")
    for prefix in ("https://www.", "http://www.", "https://", "http://"):
        if url.startswith(prefix):
            url = url[len(prefix):]
            break
    return url if url.startswith("linkedin.com/in/") else None


def norm_email(e):
    if not e: return None
    e = e.strip().lower().split(",")[0].strip()
    return e if "@" in e and "." in e.split("@")[1] else None


def safe(v, maxlen=None):
    if v is None: return None
    s = str(v).strip()
    if not s: return None
    return s[:maxlen] if maxlen else s


def parse_int(v):
    try: return int(str(v).replace(",", "").strip())
    except: return None


def parse_smallint(v):
    r = parse_int(v)
    if r is None: return None
    return r if -32768 <= r <= 32767 else None


def parse_row(row):
    li_url = norm_li(row.get("LinkedIn Url", ""))
    email  = norm_email(row.get("Emails", ""))
    if not li_url and not email: return None
    phone = safe(row.get("Mobile", "")) or safe(row.get("Phone numbers", ""))
    return {
        "linkedin_url":         li_url,
        "email":                email,
        "first_name":           safe(row.get("First Name", "")),
        "last_name":            safe(row.get("Last Name", "")),
        "title":                safe(row.get("Job title", "")),
        "sub_role":             safe(row.get("Sub Role", "")),
        "gender":               safe(row.get("Gender", "")),
        "birth_year":           parse_smallint(row.get("Birth Year", "")),
        "skills":               safe(row.get("Skills", ""), 2000),
        "summary":              safe(row.get("Summary", ""), 2000),
        "job_summary":          safe(row.get("Job Summary", ""), 1000),
        "inferred_salary":      safe(row.get("Inferred Salary", "")),
        "years_experience":     parse_smallint(row.get("Years Experience", "")),
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


def get_conn():
    con = connect(DB_URL)
    con.autocommit = False
    cur = con.cursor()
    cur.execute("SET work_mem = '256MB'")
    cur.execute("SET synchronous_commit = 'off'")
    con.commit()
    return con


UPDATE_BY_LI = """
    UPDATE discover_people dp SET
        first_name   = COALESCE(dp.first_name,   d.first_name),
        last_name    = COALESCE(dp.last_name,    d.last_name),
        title        = COALESCE(dp.title,        d.title),
        phone        = COALESCE(dp.phone,        d.phone),
        country      = COALESCE(dp.country,      d.country),
        state        = COALESCE(dp.state,        d.state),
        city         = COALESCE(dp.city,         d.city),
        company_name = COALESCE(dp.company_name, d.company_name)
    FROM (VALUES %s) AS d(linkedin_url, first_name, last_name, title, phone, country, state, city, company_name)
    WHERE dp.linkedin_url = d.linkedin_url
"""

UPDATE_BY_EMAIL = """
    UPDATE discover_people dp
    SET linkedin_url = COALESCE(dp.linkedin_url, d.linkedin_url)
    FROM (VALUES %s) AS d(email, linkedin_url)
    WHERE dp.email = d.email AND d.linkedin_url IS NOT NULL AND dp.linkedin_url IS NULL
"""

INSERT_SQL = """
    INSERT INTO discover_people
        (id, first_name, last_name, title, sub_role, gender, birth_year, skills, summary,
         job_summary, inferred_salary, years_experience, linkedin_connections, email, phone,
         linkedin_url, country, state, city, company_name, facebook_url, twitter_url,
         github_url, interests, start_date, source)
    VALUES %s
    ON CONFLICT (email) WHERE email IS NOT NULL AND email <> '' DO NOTHING
"""


def flush(cur, con, li_batch, email_batch, insert_batch, stats):
    if li_batch:
        try:
            execute_values(cur, UPDATE_BY_LI, [
                (r["linkedin_url"], r["first_name"], r["last_name"], r["title"],
                 r["phone"], r["country"], r["state"], r["city"], r["company_name"])
                for r in li_batch
            ])
            stats["updated_li"] += len(li_batch)
        except Exception as e:
            log.warning(f"  li update batch error: {e}")
            con.rollback()

    if email_batch:
        try:
            execute_values(cur, UPDATE_BY_EMAIL, [(r["email"], r["linkedin_url"]) for r in email_batch])
            stats["updated_email"] += len(email_batch)
        except Exception as e:
            log.warning(f"  email update batch error: {e}")
            con.rollback()

    seen = set()
    deduped = []
    for r in insert_batch:
        key = (r.get("email") or "").lower() or (r.get("linkedin_url") or "").lower()
        if key and key not in seen:
            seen.add(key)
            deduped.append(r)
    if deduped:
        try:
            execute_values(cur, INSERT_SQL, [
                (str(uuid.uuid4()), r["first_name"], r["last_name"], r["title"], r["sub_role"],
                 r["gender"], r["birth_year"], r["skills"], r["summary"], r["job_summary"],
                 r["inferred_salary"], r["years_experience"], r["linkedin_connections"],
                 r["email"], r["phone"], r["linkedin_url"], r["country"], r["state"], r["city"],
                 r["company_name"], r["facebook_url"], r["twitter_url"], r["github_url"],
                 r["interests"], r["start_date"], "linkedin")
                for r in deduped
            ])
            stats["inserted"] += len(deduped)
        except Exception as e:
            log.warning(f"  insert batch error: {e}")
            con.rollback()

    con.commit()
    li_batch.clear()
    email_batch.clear()
    insert_batch.clear()


def main():
    log.info("=== LinkedIn USA import starting ===")
    con = get_conn()
    cur = con.cursor()
    stats = {"updated_li": 0, "updated_email": 0, "inserted": 0, "skipped": 0, "total": 0}
    li_batch, email_batch, insert_batch = [], [], []
    last_log = time.time()

    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        usa_entries = [
            e for e in zf.infolist()
            if e.filename.endswith(".csv")
            and "Copy of USA" in e.filename
            and "by State" not in e.filename
        ]
        log.info(f"Found {len(usa_entries)} USA file(s):")
        for e in usa_entries:
            log.info(f"  {e.filename} ({e.file_size/1e9:.1f} GB)")

        for entry in usa_entries:
            log.info(f"Processing: {entry.filename} ({entry.file_size/1e9:.1f} GB uncompressed)")
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

                        if time.time() - last_log >= 30:
                            log.info(
                                f"  total={stats['total']:,}  upd_li={stats['updated_li']:,}  "
                                f"inserted={stats['inserted']:,}  skipped={stats['skipped']:,}"
                            )
                            last_log = time.time()

            except Exception as e:
                log.error(f"  Error: {e}")
                con.rollback()
                try:
                    con = get_conn()
                    cur = con.cursor()
                    li_batch.clear(); email_batch.clear(); insert_batch.clear()
                except Exception as e2:
                    log.error(f"  Reconnect failed: {e2}")
                    return

        flush(cur, con, li_batch, email_batch, insert_batch, stats)

    log.info("=== LinkedIn USA import complete ===")
    log.info(
        f"  total={stats['total']:,}  updated_li={stats['updated_li']:,}  "
        f"updated_email={stats['updated_email']:,}  inserted={stats['inserted']:,}  "
        f"skipped={stats['skipped']:,}"
    )
    cur.close()
    con.close()


if __name__ == "__main__":
    main()
