#!/usr/bin/env python3
"""
post-import-dedup.py
Run this after ALL imports (PDL + LinkedIn) are complete.

What it does:
  Step 1 — Email-alt cross-merge
    Where record A accumulated record B's email in its email_alts
    (because A was matched by linkedin_url but B was separately
    inserted from another source for the same person), merge B → A:
    transfer B's enrichment fields, combine email arrays, delete B.

  Step 2 — LinkedIn / PDL email reconciliation
    For every LinkedIn-sourced record that has a linkedin_url, check if
    a PDL record shares that linkedin_url. If two separate records
    somehow exist (shouldn't due to unique index, but sanity check),
    merge the LinkedIn record's personal email into the PDL record's
    email_alts and delete the LinkedIn duplicate.

  Step 3 — Report name+company duplicates
    Finds pairs of records with matching (first_name, last_name, company_name)
    but different emails. Prints the top 50 as candidates for manual review.
    Does NOT auto-merge these — too risky without human inspection.

Run:
    nohup python3 -u post-import-dedup.py >> /data/dedup.log 2>&1 &
"""

import logging, sys, time
from psycopg2 import connect
from psycopg2.extras import execute_values

DB_URL   = "postgresql://leadash_user:U7Guy7DRejBVYctiz09qAajNvCKWr6zPrvdM9NR22T0@localhost/leadash_leads"
LOG_FILE = "/data/dedup.log"
DRY_RUN  = False   # set True to preview without modifying

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, mode="a"),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger()


def get_conn():
    con = connect(DB_URL)
    con.autocommit = False
    cur = con.cursor()
    cur.execute("SET work_mem = '2GB'")
    cur.execute("SET synchronous_commit = 'off'")
    con.commit()
    return con, cur


# ── Helpers ───────────────────────────────────────────────────────────────────

ENRICHMENT_COALESCE = """
    first_name           = COALESCE(dp.first_name,           loser.first_name),
    last_name            = COALESCE(dp.last_name,            loser.last_name),
    title                = COALESCE(dp.title,                loser.title),
    seniority            = COALESCE(dp.seniority,            loser.seniority),
    department           = COALESCE(dp.department,           loser.department),
    sub_role             = COALESCE(dp.sub_role,             loser.sub_role),
    gender               = COALESCE(dp.gender,               loser.gender),
    birth_year           = COALESCE(dp.birth_year,           loser.birth_year),
    linkedin_url         = COALESCE(dp.linkedin_url,         loser.linkedin_url),
    phone                = COALESCE(dp.phone,                loser.phone),
    country              = COALESCE(dp.country,              loser.country),
    state                = COALESCE(dp.state,                loser.state),
    city                 = COALESCE(dp.city,                 loser.city),
    company_id           = COALESCE(dp.company_id,           loser.company_id),
    company_name         = COALESCE(dp.company_name,         loser.company_name),
    skills               = COALESCE(dp.skills,               loser.skills),
    summary              = COALESCE(dp.summary,              loser.summary),
    job_summary          = COALESCE(dp.job_summary,          loser.job_summary),
    inferred_salary      = COALESCE(dp.inferred_salary,      loser.inferred_salary),
    years_experience     = COALESCE(dp.years_experience,     loser.years_experience),
    linkedin_connections = COALESCE(dp.linkedin_connections, loser.linkedin_connections),
    facebook_url         = COALESCE(dp.facebook_url,         loser.facebook_url),
    twitter_url          = COALESCE(dp.twitter_url,          loser.twitter_url),
    github_url           = COALESCE(dp.github_url,           loser.github_url),
    interests            = COALESCE(dp.interests,            loser.interests),
    start_date           = COALESCE(dp.start_date,           loser.start_date)
"""


def merge_records(cur, winner_id: str, loser_id: str, loser_email: str, winner_email: str):
    """
    Merge loser into winner:
    1. Transfer any missing enrichment fields from loser → winner
    2. Add loser's email to winner's email_alts (and any of loser's alts)
    3. Reroute discover_reveals rows pointing to loser → winner
    4. Delete loser
    """
    # 1. Transfer fields + merge email_alts
    cur.execute(f"""
        UPDATE discover_people dp
        SET
            {ENRICHMENT_COALESCE},
            email_alts = (
                SELECT array_agg(DISTINCT e ORDER BY e)
                FROM unnest(
                    array_remove(
                        array_cat(
                            array_cat(
                                COALESCE(dp.email_alts, '{{}}'::text[]),
                                COALESCE(loser.email_alts, '{{}}'::text[])
                            ),
                            ARRAY[lower(loser.email)]
                        ),
                        lower(dp.email)   -- don't store primary as alt
                    )
                ) AS e
                WHERE e IS NOT NULL AND e != ''
            )
        FROM discover_people loser
        WHERE dp.id = %s AND loser.id = %s
    """, (winner_id, loser_id))

    # 2. Reroute any reveal rows for the loser to winner
    cur.execute("""
        INSERT INTO discover_reveals_merge_tmp (old_person_id, new_person_id)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
    """, (loser_id, winner_id)) if False else None   # handled below inline

    # We don't have a foreign key on discover_reveals (it's in Supabase, not VPS),
    # so log the rerouting pairs for the Supabase cleanup query instead.

    # 3. Delete loser
    cur.execute("DELETE FROM discover_people WHERE id = %s", (loser_id,))


# ── Step 1: Email-alt cross-merge ─────────────────────────────────────────────

def step1_email_alt_crossmerge(con, cur):
    log.info("=== Step 1: Email-alt cross-merge ===")

    # Find pairs where A.email_alts contains B.email
    # A is the winner (it already absorbed B's email), B is the duplicate to remove
    cur.execute("""
        SELECT
            a.id            AS winner_id,
            b.id            AS loser_id,
            a.email         AS winner_email,
            b.email         AS loser_email,
            a.source        AS winner_source,
            b.source        AS loser_source
        FROM discover_people a
        JOIN discover_people b
            ON lower(b.email) = ANY(a.email_alts)
        WHERE a.id != b.id
          AND a.email IS NOT NULL
          AND b.email IS NOT NULL
        ORDER BY a.id
    """)
    pairs = cur.fetchall()
    log.info(f"  Found {len(pairs):,} email-alt cross-merge candidates")

    merged = 0
    skipped = 0
    reroute_log = []   # (loser_id, winner_id) for Supabase post-cleanup

    for winner_id, loser_id, winner_email, loser_email, winner_src, loser_src in pairs:
        # Prefer PDL as winner (better email quality), swap if needed
        if loser_src == "pdl" and winner_src != "pdl":
            winner_id, loser_id = loser_id, winner_id
            winner_email, loser_email = loser_email, winner_email

        if DRY_RUN:
            log.info(f"  [DRY] merge {loser_email} ({loser_src}) → {winner_email} ({winner_src})")
            skipped += 1
            continue

        try:
            merge_records(cur, winner_id, loser_id, loser_email, winner_email)
            reroute_log.append((loser_id, winner_id))
            merged += 1
            if merged % 1000 == 0:
                con.commit()
                log.info(f"  merged {merged:,} so far…")
        except Exception as e:
            log.error(f"  Error merging {loser_id} → {winner_id}: {e}")
            con.rollback()
            skipped += 1

    con.commit()
    log.info(f"  Step 1 done: merged={merged:,}, skipped={skipped:,}")

    # Write reroute pairs for Supabase cleanup
    if reroute_log:
        with open("/data/supabase-reroute.sql", "w") as f:
            f.write("-- Run this in Supabase SQL editor to reroute discover_reveals\n")
            f.write("-- after post-import-dedup.py finishes.\n\n")
            for old_id, new_id in reroute_log:
                f.write(
                    f"UPDATE discover_reveals SET person_id = '{new_id}' "
                    f"WHERE person_id = '{old_id}';\n"
                )
        log.info(f"  Supabase reroute SQL written to /data/supabase-reroute.sql ({len(reroute_log):,} rows)")


# ── Step 2: LinkedIn/PDL same linkedin_url sanity check ───────────────────────

def step2_linkedin_url_duplicates(con, cur):
    log.info("=== Step 2: Shared linkedin_url across sources (sanity check) ===")

    cur.execute("""
        SELECT
            a.id AS winner_id, b.id AS loser_id,
            a.email AS winner_email, b.email AS loser_email,
            a.source AS winner_src, b.source AS loser_src,
            a.linkedin_url
        FROM discover_people a
        JOIN discover_people b
            ON lower(a.linkedin_url) = lower(b.linkedin_url)
        WHERE a.id < b.id          -- one row per pair
          AND a.linkedin_url IS NOT NULL
          AND b.linkedin_url IS NOT NULL
    """)
    pairs = cur.fetchall()
    log.info(f"  Found {len(pairs):,} shared-linkedin_url pairs (should be 0 due to unique index)")

    merged = 0
    reroute_log = []

    for winner_id, loser_id, winner_email, loser_email, winner_src, loser_src, li_url in pairs:
        # Prefer PDL as winner
        if loser_src == "pdl" and winner_src != "pdl":
            winner_id, loser_id = loser_id, winner_id
            winner_email, loser_email = loser_email, winner_email

        if DRY_RUN:
            log.info(f"  [DRY] li_url={li_url} — merge {loser_email} → {winner_email}")
            continue

        try:
            merge_records(cur, winner_id, loser_id, loser_email or "", winner_email or "")
            reroute_log.append((loser_id, winner_id))
            merged += 1
        except Exception as e:
            log.error(f"  Error: {e}")
            con.rollback()

    con.commit()
    log.info(f"  Step 2 done: merged={merged:,}")

    if reroute_log:
        with open("/data/supabase-reroute.sql", "a") as f:
            for old_id, new_id in reroute_log:
                f.write(
                    f"UPDATE discover_reveals SET person_id = '{new_id}' "
                    f"WHERE person_id = '{old_id}';\n"
                )


# ── Step 3: Name + company duplicate report ───────────────────────────────────

def step3_name_company_report(cur):
    log.info("=== Step 3: Name+company duplicate report (top 50, no auto-merge) ===")

    cur.execute("""
        SELECT
            a.first_name, a.last_name,
            COALESCE(a.company_name, '') AS company,
            count(*) AS cnt,
            array_agg(a.email ORDER BY a.source, a.email) AS emails,
            array_agg(a.source ORDER BY a.source, a.email) AS sources,
            array_agg(a.id::text ORDER BY a.source, a.email) AS ids
        FROM discover_people a
        WHERE a.first_name IS NOT NULL
          AND a.last_name  IS NOT NULL
          AND a.email      IS NOT NULL
          AND a.company_name IS NOT NULL
        GROUP BY a.first_name, a.last_name, COALESCE(a.company_name, '')
        HAVING count(*) > 1
        ORDER BY count(*) DESC
        LIMIT 50
    """)
    rows = cur.fetchall()
    log.info(f"  Top {len(rows)} name+company duplicate groups (review manually):")
    for first, last, company, cnt, emails, sources, ids in rows:
        log.info(f"    {first} {last} @ {company}: {cnt} records")
        for email, source, rid in zip(emails, sources, ids):
            log.info(f"      [{source}] {email}  id={rid}")


# ── Step 4: Stats summary ─────────────────────────────────────────────────────

def step4_stats(cur):
    log.info("=== Step 4: Database stats ===")

    cur.execute("SELECT COUNT(*) FROM discover_people")
    total = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM discover_people WHERE email_alts IS NOT NULL AND array_length(email_alts,1) > 0")
    with_alts = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM discover_people WHERE email IS NOT NULL")
    with_email = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM discover_people WHERE linkedin_url IS NOT NULL")
    with_li = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM discover_people WHERE source = 'pdl'")
    pdl_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM discover_people WHERE source = 'linkedin'")
    li_count = cur.fetchone()[0]

    cur.execute(
        "SELECT COUNT(*) FROM discover_people WHERE skills IS NOT NULL"
    )
    with_skills = cur.fetchone()[0]

    log.info(f"  Total records    : {total:,}")
    log.info(f"  PDL source       : {pdl_count:,}")
    log.info(f"  LinkedIn source  : {li_count:,}")
    log.info(f"  Has email        : {with_email:,}")
    log.info(f"  Has email_alts   : {with_alts:,}")
    log.info(f"  Has linkedin_url : {with_li:,}")
    log.info(f"  Has skills       : {with_skills:,}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    log.info("=== post-import-dedup.py starting ===")
    if DRY_RUN:
        log.info("  DRY RUN — no changes will be made")

    con, cur = get_conn()

    t0 = time.time()
    step1_email_alt_crossmerge(con, cur)
    step2_linkedin_url_duplicates(con, cur)
    step3_name_company_report(cur)
    step4_stats(cur)
    elapsed = time.time() - t0

    log.info(f"=== Done in {elapsed/60:.1f} minutes ===")

    if not DRY_RUN:
        log.info("Next step: check /data/supabase-reroute.sql and run it in the")
        log.info("Supabase SQL editor to reroute discover_reveals to merged person IDs.")

    cur.close()
    con.close()


if __name__ == "__main__":
    main()
