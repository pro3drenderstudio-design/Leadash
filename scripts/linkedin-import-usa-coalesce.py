#!/usr/bin/env python3
"""
linkedin-import-usa-coalesce.py
Three-step flush:
  A) UPDATE existing rows matched by email (adds linkedin_url + COALESCE all fields)
  B) INSERT by linkedin_url ON CONFLICT (linkedin_url) DO UPDATE COALESCE
     Fallback: retry without email if email conflict still fires
  C) INSERT email-only rows ON CONFLICT (email) DO UPDATE COALESCE
Run: nohup python3 -u /data/linkedin-import-usa-coalesce.py >> /data/linkedin-import-usa-coalesce.log 2>&1 &
"""
import zipfile, csv, io, logging, sys, time, uuid
from psycopg2 import connect
from psycopg2.extras import execute_values

DB_URL   = "postgresql://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"
ZIP_PATH = "/data/Linkedin Database 434,832,484.zip"
LOG_FILE = "/data/linkedin-import-usa-coalesce.log"
BATCH    = 5000

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


COLS = """(id, first_name, last_name, title, sub_role, gender, birth_year, skills, summary,
           job_summary, inferred_salary, years_experience, linkedin_connections, email, phone,
           linkedin_url, country, state, city, company_name, facebook_url, twitter_url,
           github_url, interests, start_date, source)"""


def row_tuple(r, email=True):
    return (
        str(uuid.uuid4()), r["first_name"], r["last_name"], r["title"], r["sub_role"],
        r["gender"], r["birth_year"], r["skills"], r["summary"], r["job_summary"],
        r["inferred_salary"], r["years_experience"], r["linkedin_connections"],
        r["email"] if email else None,
        r["phone"], r["linkedin_url"], r["country"], r["state"], r["city"],
        r["company_name"], r["facebook_url"], r["twitter_url"], r["github_url"],
        r["interests"], r["start_date"], "linkedin"
    )


def update_tuple(r):
    """Tuple for UPDATE_BY_EMAIL_SQL — no id/source."""
    return (
        r["linkedin_url"], r["email"], r["first_name"], r["last_name"], r["title"],
        r["sub_role"], r["gender"], r["birth_year"], r["skills"], r["summary"],
        r["job_summary"], r["inferred_salary"], r["years_experience"],
        r["linkedin_connections"], r["phone"], r["country"], r["state"], r["city"],
        r["company_name"], r["facebook_url"], r["twitter_url"], r["github_url"],
        r["interests"], r["start_date"],
    )


# Step A — enrich existing rows that share an email with incoming LI rows.
# Runs before the INSERT so the email constraint won't fire in Step B.
UPDATE_BY_EMAIL_SQL = """
    UPDATE discover_people dp SET
        linkedin_url         = COALESCE(dp.linkedin_url,         v.linkedin_url),
        first_name           = COALESCE(dp.first_name,           v.first_name),
        last_name            = COALESCE(dp.last_name,            v.last_name),
        title                = COALESCE(dp.title,                v.title),
        sub_role             = COALESCE(dp.sub_role,             v.sub_role),
        gender               = COALESCE(dp.gender,               v.gender),
        birth_year           = COALESCE(dp.birth_year,           v.birth_year::smallint),
        skills               = COALESCE(dp.skills,               v.skills),
        summary              = COALESCE(dp.summary,              v.summary),
        job_summary          = COALESCE(dp.job_summary,          v.job_summary),
        inferred_salary      = COALESCE(dp.inferred_salary,      v.inferred_salary),
        years_experience     = COALESCE(dp.years_experience,     v.years_experience::smallint),
        linkedin_connections = COALESCE(dp.linkedin_connections, v.linkedin_connections::int),
        phone                = COALESCE(dp.phone,                v.phone),
        country              = COALESCE(dp.country,              v.country),
        state                = COALESCE(dp.state,                v.state),
        city                 = COALESCE(dp.city,                 v.city),
        company_name         = COALESCE(dp.company_name,         v.company_name),
        facebook_url         = COALESCE(dp.facebook_url,         v.facebook_url),
        twitter_url          = COALESCE(dp.twitter_url,          v.twitter_url),
        github_url           = COALESCE(dp.github_url,           v.github_url),
        interests            = COALESCE(dp.interests,            v.interests),
        start_date           = COALESCE(dp.start_date,           v.start_date)
    FROM (VALUES %s) AS v(
        linkedin_url, email, first_name, last_name, title, sub_role, gender,
        birth_year, skills, summary, job_summary, inferred_salary, years_experience,
        linkedin_connections, phone, country, state, city, company_name,
        facebook_url, twitter_url, github_url, interests, start_date
    )
    WHERE dp.email = v.email
      AND v.email IS NOT NULL AND v.email <> ''::text
      AND v.linkedin_url IS NOT NULL
"""

# Step B — insert/upsert by linkedin_url.
INSERT_LI_SQL = f"""
    INSERT INTO discover_people {COLS} VALUES %s
    ON CONFLICT (lower(linkedin_url)) WHERE linkedin_url IS NOT NULL
    DO UPDATE SET
        first_name           = COALESCE(discover_people.first_name,           EXCLUDED.first_name),
        last_name            = COALESCE(discover_people.last_name,            EXCLUDED.last_name),
        title                = COALESCE(discover_people.title,                EXCLUDED.title),
        sub_role             = COALESCE(discover_people.sub_role,             EXCLUDED.sub_role),
        gender               = COALESCE(discover_people.gender,               EXCLUDED.gender),
        birth_year           = COALESCE(discover_people.birth_year,           EXCLUDED.birth_year),
        skills               = COALESCE(discover_people.skills,               EXCLUDED.skills),
        summary              = COALESCE(discover_people.summary,              EXCLUDED.summary),
        job_summary          = COALESCE(discover_people.job_summary,          EXCLUDED.job_summary),
        inferred_salary      = COALESCE(discover_people.inferred_salary,      EXCLUDED.inferred_salary),
        years_experience     = COALESCE(discover_people.years_experience,     EXCLUDED.years_experience),
        linkedin_connections = COALESCE(discover_people.linkedin_connections, EXCLUDED.linkedin_connections),
        email                = COALESCE(discover_people.email,                EXCLUDED.email),
        phone                = COALESCE(discover_people.phone,                EXCLUDED.phone),
        country              = COALESCE(discover_people.country,              EXCLUDED.country),
        state                = COALESCE(discover_people.state,                EXCLUDED.state),
        city                 = COALESCE(discover_people.city,                 EXCLUDED.city),
        company_name         = COALESCE(discover_people.company_name,         EXCLUDED.company_name),
        facebook_url         = COALESCE(discover_people.facebook_url,         EXCLUDED.facebook_url),
        twitter_url          = COALESCE(discover_people.twitter_url,          EXCLUDED.twitter_url),
        github_url           = COALESCE(discover_people.github_url,           EXCLUDED.github_url),
        interests            = COALESCE(discover_people.interests,            EXCLUDED.interests),
        start_date           = COALESCE(discover_people.start_date,           EXCLUDED.start_date)
"""

# Step C — insert/upsert email-only rows.
# Predicate must match index exactly: WHERE ((email IS NOT NULL) AND (email <> ''::text))
INSERT_EMAIL_SQL = f"""
    INSERT INTO discover_people {COLS} VALUES %s
    ON CONFLICT (email) WHERE (email IS NOT NULL) AND (email <> ''::text)
    DO UPDATE SET
        linkedin_url         = COALESCE(discover_people.linkedin_url,         EXCLUDED.linkedin_url),
        first_name           = COALESCE(discover_people.first_name,           EXCLUDED.first_name),
        last_name            = COALESCE(discover_people.last_name,            EXCLUDED.last_name),
        title                = COALESCE(discover_people.title,                EXCLUDED.title),
        sub_role             = COALESCE(discover_people.sub_role,             EXCLUDED.sub_role),
        gender               = COALESCE(discover_people.gender,               EXCLUDED.gender),
        birth_year           = COALESCE(discover_people.birth_year,           EXCLUDED.birth_year),
        skills               = COALESCE(discover_people.skills,               EXCLUDED.skills),
        summary              = COALESCE(discover_people.summary,              EXCLUDED.summary),
        job_summary          = COALESCE(discover_people.job_summary,          EXCLUDED.job_summary),
        inferred_salary      = COALESCE(discover_people.inferred_salary,      EXCLUDED.inferred_salary),
        years_experience     = COALESCE(discover_people.years_experience,     EXCLUDED.years_experience),
        linkedin_connections = COALESCE(discover_people.linkedin_connections, EXCLUDED.linkedin_connections),
        phone                = COALESCE(discover_people.phone,                EXCLUDED.phone),
        country              = COALESCE(discover_people.country,              EXCLUDED.country),
        state                = COALESCE(discover_people.state,                EXCLUDED.state),
        city                 = COALESCE(discover_people.city,                 EXCLUDED.city),
        company_name         = COALESCE(discover_people.company_name,         EXCLUDED.company_name),
        facebook_url         = COALESCE(discover_people.facebook_url,         EXCLUDED.facebook_url),
        twitter_url          = COALESCE(discover_people.twitter_url,          EXCLUDED.twitter_url),
        github_url           = COALESCE(discover_people.github_url,           EXCLUDED.github_url),
        interests            = COALESCE(discover_people.interests,            EXCLUDED.interests),
        start_date           = COALESCE(discover_people.start_date,           EXCLUDED.start_date)
"""


def _run_li_steps(cur, li_deduped, li_with_email, use_email):
    if li_with_email:
        execute_values(cur, UPDATE_BY_EMAIL_SQL, [update_tuple(r) for r in li_with_email])
    if li_deduped:
        execute_values(cur, INSERT_LI_SQL, [row_tuple(r, email=use_email) for r in li_deduped])


def flush(cur, con, li_batch, email_batch, stats):
    li_seen, email_seen = set(), set()
    li_deduped, email_deduped = [], []

    for r in li_batch:
        key = r["linkedin_url"].lower()
        if key not in li_seen:
            li_seen.add(key)
            li_deduped.append(r)

    for r in email_batch:
        key = r["email"].lower()
        if key not in email_seen:
            email_seen.add(key)
            email_deduped.append(r)

    li_with_email = [r for r in li_deduped if r.get("email")]

    # LI batch (Steps A + B) — committed independently so email failures don't wipe it
    if li_deduped:
        try:
            _run_li_steps(cur, li_deduped, li_with_email, use_email=True)
            con.commit()
            stats["upserted"] += len(li_deduped)
        except Exception:
            con.rollback()
            try:
                # Fallback: strip email to avoid "same email, two different linkedin_urls" edge case
                _run_li_steps(cur, li_deduped, li_with_email, use_email=False)
                con.commit()
                stats["upserted"] += len(li_deduped)
            except Exception as e2:
                log.warning(f"  LI batch error: {e2}")
                con.rollback()

    # Email batch — committed independently
    if email_deduped:
        try:
            execute_values(cur, INSERT_EMAIL_SQL, [row_tuple(r) for r in email_deduped])
            con.commit()
            stats["upserted"] += len(email_deduped)
        except Exception as e:
            log.warning(f"  email batch error: {e}")
            con.rollback()

    li_batch.clear()
    email_batch.clear()


def main():
    log.info("=== LinkedIn USA COALESCE upsert starting ===")
    con = get_conn()
    cur = con.cursor()
    stats = {"upserted": 0, "skipped": 0, "total": 0}
    li_batch, email_batch = [], []
    last_log = time.time()
    start_time = time.time()

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
                        else:
                            email_batch.append(rec)

                        if len(li_batch) + len(email_batch) >= BATCH:
                            flush(cur, con, li_batch, email_batch, stats)

                        if time.time() - last_log >= 30:
                            elapsed = time.time() - start_time
                            rate = stats["total"] / elapsed if elapsed > 0 else 0
                            eta_sec = ((entry.file_size / 500) - stats["total"]) / rate if rate > 0 else 0
                            log.info(
                                f"  total={stats['total']:,}  upserted={stats['upserted']:,}  "
                                f"skipped={stats['skipped']:,}  rate={rate:.0f}/s  "
                                f"eta={eta_sec/3600:.1f}h"
                            )
                            last_log = time.time()

            except Exception as e:
                log.error(f"  Error processing file: {e}")
                con.rollback()
                try:
                    con = get_conn()
                    cur = con.cursor()
                    li_batch.clear()
                    email_batch.clear()
                except Exception as e2:
                    log.error(f"  Reconnect failed: {e2}")
                    return

        flush(cur, con, li_batch, email_batch, stats)

    elapsed = time.time() - start_time
    log.info("=== LinkedIn USA COALESCE upsert complete ===")
    log.info(
        f"  total={stats['total']:,}  upserted={stats['upserted']:,}  "
        f"skipped={stats['skipped']:,}  elapsed={elapsed/3600:.1f}h"
    )
    cur.close()
    con.close()


if __name__ == "__main__":
    main()
