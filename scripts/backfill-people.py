#!/usr/bin/env python3
"""
backfill-people.py — Enriches discover_people in 5 steps:

  Step 1: Title → seniority + department classifier     (~41M rows,  ~2h)
  Step 2: Company name → company_id exact match         (~34M rows,  ~1h)
  Step 3: Add + populate denormalized company columns   (~87M+ rows, ~3h)
  Step 4: Fuzzy company name matching (trigram)         (remaining,  ~6h)
  Step 5: Normalize country to Title Case               (~532M rows, ~4h)

Each step is independently resumable via /data/backfill-checkpoint.json.
Run: nohup python3 -u /data/backfill-people.py >> /data/backfill.log 2>&1 &
"""

import psycopg2, psycopg2.extras, logging, sys, time, json, os

DB_URL    = "postgresql://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"
LOG_FILE  = "/data/backfill.log"
CKPT_FILE = "/data/backfill-checkpoint.json"
BATCH     = 50_000

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, mode="a"),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger()


def load_ckpt():
    if os.path.exists(CKPT_FILE):
        with open(CKPT_FILE) as f:
            return json.load(f)
    return {}

def save_ckpt(data):
    with open(CKPT_FILE, "w") as f:
        json.dump(data, f, indent=2)

def conn():
    return psycopg2.connect(DB_URL)

def eta(done, total, elapsed):
    if done == 0: return "?"
    rate = done / elapsed
    rem  = (total - done) / rate if rate > 0 else 0
    return f"{rem/3600:.1f}h"


# ── Classifier rules ──────────────────────────────────────────────────────────
# Order matters — first match wins within each category

SENIORITY_RULES = [
    ("intern",   ["intern"]),
    ("entry",    ["associate ", "analyst", "assistant", "coordinator",
                  "specialist", "representative", "junior", "jr.", "jr ",
                  "entry level", "entry-level"]),
    ("senior",   ["senior", "sr.", "sr ", "lead ", "principal ", "staff engineer",
                  "staff software", "distinguished"]),
    ("manager",  ["manager", " mgr", "mgr ", "supervisor", "superintendent",
                  "foreman", "foreperson"]),
    ("director", ["director"]),
    ("head",     ["head of ", "head, "]),
    ("vp",       ["vp ", "vp,", "v.p.", "vice president"]),
    ("partner",  ["partner"]),
    ("c_suite",  ["chief ", " ceo", "ceo ", " cfo", "cfo ", " coo", "coo ",
                  " cto", "cto ", " cmo", "cmo ", " cso", "cso ",
                  " chro", " cio", " cpo", "c.e.o", "c.t.o", "c.f.o", "c.o.o"]),
    ("founder",  ["founder", "co-founder", "cofounder"]),
    ("owner",    ["owner", "proprietor", "self-employed", "self employed"]),
]

DEPARTMENT_RULES = [
    ("sales",                  ["sales", "account executive", "account manager",
                                 "revenue", "business development", "bd ", " bd,",
                                 "partnerships", "account rep"]),
    ("marketing",              ["marketing", "brand ", "growth hacker", "growth market",
                                 "content market", " seo", "social media", "demand gen",
                                 "communications", " pr ", "public relations", "advertis",
                                 "email market"]),
    ("engineer",               ["engineer", "developer", "programmer", "architect",
                                 "devops", "software", "data scien", "machine learning",
                                 "ml ", "data engineer", "backend", "frontend",
                                 "full stack", "fullstack", "qa ", "quality assurance",
                                 "infrastructure", "platform engineer", "security engineer",
                                 "site reliability", "sre ", "android", "ios dev",
                                 "mobile dev"]),
    ("finance",                ["financ", "accounting", "accountant", "cfo",
                                 "treasurer", "controller", "bookkeep", "payroll",
                                 "audit", "tax "]),
    ("operations",             ["operations", " ops", "supply chain", "logistics",
                                 "procurement", "warehouse", "fulfillment",
                                 "fleet manager", "project manager", "program manager"]),
    ("human resources",        ["human resources", " hr ", "hr,", "recruiter",
                                 "recruiting", "talent acqui", "people ops",
                                 "people & culture", "workforce", "staffing"]),
    ("information technology", ["information technology", " it ", "it,",
                                 "systems admin", "network admin", "network engineer",
                                 "cybersecurity", "sysadmin", "helpdesk",
                                 "tech support", "it manager", "it director"]),
    ("legal",                  ["legal", "counsel", "attorney", "lawyer",
                                 "compliance", "paralegal", "general counsel"]),
    ("design",                 ["design", " ux", "ux,", " ui ", "ui,",
                                 "art director", "graphic", "product design",
                                 "visual design", "creative director"]),
    ("customer service",       ["customer success", "customer service",
                                 "customer support", "client success",
                                 "client service", "support specialist",
                                 "support manager", "customer experience"]),
    ("consulting",             ["consultant", "consulting", " advisor", "advisory"]),
    ("health",                 ["nurse", "physician", "medical ", "healthcare",
                                 "clinical", "therapist", "pharmacist", "dentist",
                                 "surgeon", "health coach", "physical therapy",
                                 "registered nurse", "rn,", " rn "]),
    ("education",              ["teacher", "professor", "instructor", "educator",
                                 "principal", "lecturer", "tutor", "faculty",
                                 "academic", "school"]),
    ("manager",                ["manager", "management"]),
]

def classify_title(title: str):
    t = " " + title.lower() + " "
    sen  = next((s for s, kws in SENIORITY_RULES  if any(k in t for k in kws)), None)
    dept = next((d for d, kws in DEPARTMENT_RULES if any(k in t for k in kws)), None)
    return sen, dept


# ── Step 1: Title → Seniority + Department ────────────────────────────────────

def step1(ckpt):
    if ckpt.get("step1_done"):
        log.info("Step 1 already complete — skipping")
        return

    log.info("=== Step 1: Title → Seniority + Department ===")

    # Separate read/write connections — named cursor is invalidated by commits on same conn
    rc = conn()
    wc = conn()

    with rc.cursor() as cnt:
        cnt.execute("SELECT count(*) FROM discover_people WHERE seniority IS NULL AND title IS NOT NULL AND title <> ''")
        total = cnt.fetchone()[0]
    log.info(f"  Candidates: {total:,}")

    cur = rc.cursor("s1_cur", cursor_factory=psycopg2.extras.DictCursor)
    cur.itersize = BATCH
    cur.execute("""
        SELECT id, title FROM discover_people
        WHERE seniority IS NULL AND title IS NOT NULL AND title <> ''
    """)

    done = 0
    start = time.time()
    batch_ids, batch_sen, batch_dept = [], [], []

    for row in cur:
        sen, dept = classify_title(row["title"])
        if sen or dept:
            batch_ids.append(row["id"])
            batch_sen.append(sen)
            batch_dept.append(dept)

        if len(batch_ids) >= BATCH:
            _flush_step1(wc, batch_ids, batch_sen, batch_dept)
            done += len(batch_ids)
            batch_ids, batch_sen, batch_dept = [], [], []
            log.info(f"  updated={done:,}/{total:,}  eta={eta(done, total, time.time()-start)}")

    if batch_ids:
        _flush_step1(wc, batch_ids, batch_sen, batch_dept)
        done += len(batch_ids)

    cur.close()
    rc.close()
    wc.close()
    ckpt["step1_done"] = True
    save_ckpt(ckpt)
    log.info(f"  Step 1 complete — {done:,} rows updated in {(time.time()-start)/3600:.1f}h")


def _flush_step1(c, ids, sen_list, dept_list):
    with c.cursor() as cur:
        cur.execute("""
            UPDATE discover_people p
            SET
              seniority  = COALESCE(v.seniority,  p.seniority),
              department = COALESCE(v.department, p.department)
            FROM (
              SELECT
                unnest(%s::uuid[])  AS id,
                unnest(%s::text[])  AS seniority,
                unnest(%s::text[])  AS department
            ) v
            WHERE p.id = v.id AND p.seniority IS NULL
        """, (ids, sen_list, dept_list))
    c.commit()


# ── Step 2: Company name → company_id exact match ────────────────────────────

def step2(ckpt):
    if ckpt.get("step2_done"):
        log.info("Step 2 already complete — skipping")
        return

    log.info("=== Step 2: Company name → company_id (exact match) ===")
    c = conn()
    start = time.time()

    with c.cursor() as cur:
        cur.execute("SELECT count(*) FROM discover_people WHERE company_id IS NULL AND company_name IS NOT NULL AND company_name <> ''")
        total = cur.fetchone()[0]
    log.info(f"  Candidates: {total:,}")

    with c.cursor() as cur:
        cur.execute("""
            UPDATE discover_people p
            SET company_id = c.id
            FROM discover_companies c
            WHERE p.company_id IS NULL
              AND p.company_name IS NOT NULL AND p.company_name <> ''
              AND lower(p.company_name) = lower(c.name)
        """)
        updated = cur.rowcount
        c.commit()

    ckpt["step2_done"] = True
    save_ckpt(ckpt)
    log.info(f"  Step 2 complete — {updated:,} rows matched in {(time.time()-start)/3600:.1f}h")


# ── Step 3: Add + populate denormalized company columns ──────────────────────

def step3(ckpt):
    if ckpt.get("step3_done"):
        log.info("Step 3 already complete — skipping")
        return

    log.info("=== Step 3: Denormalize company fields onto people rows ===")
    c = conn()
    start = time.time()

    # Add columns if they don't exist (requires table ownership; skip if already present)
    try:
        with c.cursor() as cur:
            cur.execute("""
                ALTER TABLE discover_people
                  ADD COLUMN IF NOT EXISTS company_industry text,
                  ADD COLUMN IF NOT EXISTS company_keywords  text,
                  ADD COLUMN IF NOT EXISTS company_size      text
            """)
            c.commit()
        log.info("  Columns added (or already existed)")
    except Exception as e:
        c.rollback()
        log.info(f"  ALTER TABLE skipped ({e}) — assuming columns exist")

    with c.cursor() as cnt:
        cnt.execute("SELECT count(*) FROM discover_people WHERE company_id IS NOT NULL AND company_industry IS NULL")
        total = cnt.fetchone()[0]
    log.info(f"  Candidates: {total:,}")

    # Batch by processing in chunks using ctid page ranges isn't easy here;
    # use offset-based chunking on company_id groups instead
    with c.cursor() as cur:
        cur.execute("""
            UPDATE discover_people p
            SET
              company_industry = c.industry,
              company_keywords  = c.keywords,
              company_size      = c.size_range
            FROM discover_companies c
            WHERE p.company_id = c.id
              AND p.company_industry IS NULL
        """)
        updated = cur.rowcount
        c.commit()

    c.close()
    ckpt["step3_done"] = True
    save_ckpt(ckpt)
    log.info(f"  Step 3 complete — {updated:,} rows populated in {(time.time()-start)/3600:.1f}h")


# ── Step 4: Fuzzy company name matching (trigram) ────────────────────────────

def step4(ckpt):
    if ckpt.get("step4_done"):
        log.info("Step 4 already complete — skipping")
        return

    log.info("=== Step 4: Fuzzy company name matching (trigram, similarity >= 0.85) ===")
    c = conn()
    start = time.time()

    # Ensure pg_trgm is available
    with c.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        c.commit()

    with c.cursor() as cnt:
        cnt.execute("""
            SELECT count(*) FROM discover_people
            WHERE company_id IS NULL AND company_name IS NOT NULL AND company_name <> ''
        """)
        total = cnt.fetchone()[0]
    log.info(f"  Candidates after exact match: {total:,}")

    # Separate read/write connections — named cursor invalidated by commits on same conn
    rc = conn()
    wc = conn()

    fetch_cur = rc.cursor("s4_fetch", cursor_factory=psycopg2.extras.DictCursor)
    fetch_cur.itersize = 5_000
    fetch_cur.execute("""
        SELECT id, company_name FROM discover_people
        WHERE company_id IS NULL AND company_name IS NOT NULL AND company_name <> ''
    """)

    done = 0
    match_cur = rc.cursor()
    batch_ids, batch_cids = [], []

    for row in fetch_cur:
        match_cur.execute("""
            SELECT id FROM discover_companies
            WHERE similarity(lower(name), lower(%s)) >= 0.85
            ORDER BY similarity(lower(name), lower(%s)) DESC
            LIMIT 1
        """, (row["company_name"], row["company_name"]))
        result = match_cur.fetchone()
        if result:
            batch_ids.append(row["id"])
            batch_cids.append(result[0])

        if len(batch_ids) >= 5_000:
            _flush_step4(wc, batch_ids, batch_cids)
            done += len(batch_ids)
            batch_ids, batch_cids = [], []
            log.info(f"  matched={done:,}/{total:,}  eta={eta(done, total, time.time()-start)}")

    if batch_ids:
        _flush_step4(wc, batch_ids, batch_cids)
        done += len(batch_ids)

    fetch_cur.close()
    match_cur.close()
    rc.close()
    wc.close()
    ckpt["step4_done"] = True
    save_ckpt(ckpt)
    log.info(f"  Step 4 complete — {done:,} fuzzy matches in {(time.time()-start)/3600:.1f}h")


def _flush_step4(c, ids, cids):
    with c.cursor() as cur:
        cur.execute("""
            UPDATE discover_people p
            SET company_id = v.company_id
            FROM (
              SELECT unnest(%s::uuid[]) AS id, unnest(%s::uuid[]) AS company_id
            ) v
            WHERE p.id = v.id AND p.company_id IS NULL
        """, (ids, cids))
    c.commit()


# ── Step 5: Normalize country to Title Case ───────────────────────────────────

def step5(ckpt):
    if ckpt.get("step5_done"):
        log.info("Step 5 already complete — skipping")
        return

    log.info("=== Step 5: Normalize country casing to Title Case ===")
    c = conn()
    start = time.time()

    with c.cursor() as cnt:
        cnt.execute("SELECT count(*) FROM discover_people WHERE country IS NOT NULL AND country <> '' AND country != initcap(lower(country))")
        total = cnt.fetchone()[0]
    log.info(f"  Candidates: {total:,}")

    with c.cursor() as cur:
        cur.execute("""
            UPDATE discover_people
            SET country = initcap(lower(country))
            WHERE country IS NOT NULL AND country <> ''
              AND country != initcap(lower(country))
        """)
        updated = cur.rowcount
        c.commit()

    c.close()
    ckpt["step5_done"] = True
    save_ckpt(ckpt)
    log.info(f"  Step 5 complete — {updated:,} rows normalized in {(time.time()-start)/3600:.1f}h")


# ── After step 4, re-run step 3 for newly matched companies ──────────────────

def step3b(ckpt):
    if ckpt.get("step3b_done"):
        log.info("Step 3b already complete — skipping")
        return

    log.info("=== Step 3b: Populate company fields for fuzzy-matched rows ===")
    c = conn()
    start = time.time()

    with c.cursor() as cur:
        cur.execute("""
            UPDATE discover_people p
            SET
              company_industry = c.industry,
              company_keywords  = c.keywords,
              company_size      = c.size_range
            FROM discover_companies c
            WHERE p.company_id = c.id
              AND p.company_industry IS NULL
        """)
        updated = cur.rowcount
        c.commit()

    c.close()
    ckpt["step3b_done"] = True
    save_ckpt(ckpt)
    log.info(f"  Step 3b complete — {updated:,} rows populated in {(time.time()-start)/3600:.1f}h")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", default="1,2,3,4,5", help="Comma-separated steps to run (default: all)")
    parser.add_argument("--reset", action="store_true", help="Reset checkpoint for specified steps")
    args = parser.parse_args()

    steps = [s.strip() for s in args.steps.split(",")]
    ckpt  = load_ckpt()

    if args.reset:
        for s in steps:
            key = f"step{s}_done"
            if key in ckpt:
                del ckpt[key]
                log.info(f"Reset step {s}")
        save_ckpt(ckpt)

    log.info(f"Starting backfill — steps: {steps}")
    total_start = time.time()

    if "1" in steps: step1(ckpt)
    if "2" in steps: step2(ckpt)
    if "3" in steps: step3(ckpt)
    if "4" in steps: step4(ckpt)
    if "4" in steps and "3" in steps: step3b(ckpt)
    if "5" in steps: step5(ckpt)

    log.info(f"=== All done in {(time.time()-total_start)/3600:.1f}h ===")
