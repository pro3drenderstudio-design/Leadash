import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import leadsDb from "@/lib/postgres/leads-db";
import {
  searchCacheKey, getCachedSearch, setCachedSearch, checkDiscoverRateLimit,
  getCachedWorkspaceEmails, setCachedWorkspaceEmails,
} from "@/lib/discover-cache";
import type { DiscoverSearchResponse, DiscoverResult } from "@/types/discover";

// ids_only bulk selection sweeps companies for up to ~35s per request and
// resumes via comp_offset (see the chunked collector below); 120 leaves
// headroom for the final chunk + retries. Normal searches bail at the DB
// statement_timeout long before this.
export const maxDuration = 120;

const CREDITS_PER_LEAD = 0.5;
const DEFAULT_LIMIT    = 25;
const MAX_LIMIT        = 100;
const IDS_ONLY_MAX     = 50_000;

// Full-text expression matching the GIN index discover_people_fts_idx on the
// leads DB. Word-based FTS replaced trigram ILIKE for free-text on the 559M-row
// table — it scales AND lets the planner BitmapAnd it with the seniority/country
// index for multi-filter searches. NOTE: FTS covers title + company_name
// together, so title/company "include" filters match either field.
const FTS_EXPR = `to_tsvector('english', coalesce(p.title,'') || ' ' || coalesce(p.company_name,''))`;

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return null;
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : "•••";
}

function csv(val: string | null | undefined, fallback: string[] = []): string[] {
  const v = (val || "").trim();
  if (!v) return fallback;
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  // ── Rate limit: 60 searches/min per workspace ─────────────────────────────
  const rl = await checkDiscoverRateLimit(workspaceId);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  const p = new URL(req.url).searchParams;

  const keyword         = p.get("q")?.trim() || null;
  const titleIncludes   = csv(p.get("title_include"));
  const titleExcludes   = csv(p.get("title_exclude"));
  const seniorities        = csv(p.get("seniority"));
  const senioritiesExclude = csv(p.get("seniority_exclude"));
  const departments        = csv(p.get("department"));
  const departmentsExclude = csv(p.get("department_exclude"));
  const countryIncludes  = csv(p.get("country_include"));
  const countryExcludes  = csv(p.get("country_exclude"));
  const locationIncludes = csv(p.get("location_include"));
  const locationExcludes = csv(p.get("location_exclude"));
  const companyIncludes = csv(p.get("company_include"));
  const companyExcludes = csv(p.get("company_exclude"));
  const industryIncludes = csv(p.get("industry_include"));
  const industryExcludes = csv(p.get("industry_exclude"));
  const companySizes           = csv(p.get("company_size"));
  const companyKeywordIncludes = csv(p.get("co_keyword_include"));
  const companyKeywordExcludes = csv(p.get("co_keyword_exclude"));
  const emailStatus            = p.get("email_status") || "any";
  const netNew     = p.get("net_new")    === "true";
  const idsOnly    = p.get("ids_only")    === "true";
  const skipCount  = p.get("skip_count") === "true";
  const page       = Math.max(1, parseInt(p.get("page") || "1"));
  const requestedLimit  = Math.max(1, parseInt(p.get("limit") || String(DEFAULT_LIMIT)));
  const limit           = idsOnly
    ? Math.min(requestedLimit, IDS_ONLY_MAX)
    : Math.min(requestedLimit, MAX_LIMIT);
  const offset          = (page - 1) * limit;

  const SORT_COLS: Record<string, string> = {
    name:         "p.first_name, p.last_name",
    title:        "p.title",
    company_name: "p.company_name",
    location:     "p.country, p.city",
    email_status: "p.email_status",
    created_at:   "p.created_at",
  };
  const sortRaw  = p.get("sort") || "created_at";
  const sortCol  = SORT_COLS[sortRaw] ?? "p.created_at";
  const sortDir  = p.get("order") === "asc" ? "ASC" : "DESC";

  // ── Cache lookup (skip for ids_only + net_new — those are user-specific) ──
  const cacheable = !idsOnly && !netNew;
  const cKey = cacheable ? searchCacheKey(p) : null;
  if (cKey) {
    const hit = await getCachedSearch(cKey);
    if (hit) return NextResponse.json(hit);
  }

  try {
    const conditions: string[] = [];
    const params: unknown[]    = [];
    let   i = 1;

    function addOr(field: string, values: string[], substring = false) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `${field} ILIKE $${i + j}`).join(" OR ");
      conditions.push(`(${clauses})`);
      params.push(...values.map(v => substring ? `%${v}%` : v));
      i += values.length;
    }

    // For low-cardinality enum-like fields with lower() btree indexes.
    function addOrExact(field: string, values: string[]) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `lower(${field}) = lower($${i + j})`).join(" OR ");
      conditions.push(`(${clauses})`);
      params.push(...values);
      i += values.length;
    }

    function addNoneExact(field: string, values: string[]) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `lower(${field}) = lower($${i + j})`).join(" OR ");
      conditions.push(`NOT (${clauses})`);
      params.push(...values);
      i += values.length;
    }

    function addNone(field: string, values: string[], substring = false) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `${field} ILIKE $${i + j}`).join(" OR ");
      conditions.push(`NOT (${clauses})`);
      params.push(...values.map(v => substring ? `%${v}%` : v));
      i += values.length;
    }

    function addOrLower(field: string, values: string[]) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `lower(${field}) = lower($${i + j})`).join(" OR ");
      conditions.push(`(${clauses})`);
      params.push(...values);
      i += values.length;
    }

    function addNoneLower(field: string, values: string[]) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `lower(${field}) = lower($${i + j})`).join(" OR ");
      conditions.push(`NOT (${clauses})`);
      params.push(...values);
      i += values.length;
    }

    function addLocationOr(values: string[]) {
      if (!values.length) return;
      const perVal = values.map((_, j) =>
        `(p.country ILIKE $${i + j} OR p.state ILIKE $${i + j} OR p.city ILIKE $${i + j})`
      );
      conditions.push(`(${perVal.join(" OR ")})`);
      params.push(...values.map(v => `%${v}%`));
      i += values.length;
    }

    function addLocationNone(values: string[]) {
      if (!values.length) return;
      const perVal = values.map((_, j) =>
        `(p.country ILIKE $${i + j} OR p.state ILIKE $${i + j} OR p.city ILIKE $${i + j})`
      );
      conditions.push(`NOT (${perVal.join(" OR ")})`);
      params.push(...values.map(v => `%${v}%`));
      i += values.length;
    }

    // OR of full-text matches (one plainto_tsquery per value) against FTS_EXPR —
    // each drives the FTS GIN index, BitmapOr'd together.
    function addFtsOr(values: string[]) {
      if (!values.length) return;
      const clauses = values.map((_, j) => `${FTS_EXPR} @@ plainto_tsquery('english', $${i + j})`).join(" OR ");
      conditions.push(`(${clauses})`);
      params.push(...values);
      i += values.length;
    }

    // Keyword box + title/company "include" filters all go through FTS (see
    // FTS_EXPR). These free-text filters on the 559M-row table drop the
    // created_at ordering below so the FTS GIN bitmap can stop-early instead of
    // the planner walking the created_at index and applying the text predicate
    // as a (catastrophic) filter.
    if (keyword) addFtsOr([keyword]);
    addFtsOr(titleIncludes);
    addNone("p.title",    titleExcludes,   true);
    // Multi-value seniority is handled via UNION ALL (one subquery per value) so each
    // sub-query drives seniority_created_idx directly. Single value goes into conditions
    // normally. Exclusions always go into conditions regardless.
    if (seniorities.length <= 1) {
      addOrExact("p.seniority", seniorities);
    }
    addNoneExact("p.seniority", senioritiesExclude);
    addOr("p.department",  departments,        true);
    addNone("p.department", departmentsExclude, true);
    // When we will generate a UNION ALL per (seniority × country), pull countries out of
    // the shared WHERE so each subquery gets exact equality on both columns and the planner
    // can use discover_people_sen_country_created_idx. Single-country queries leave the
    // country in WHERE (the index handles seniority+country= fine with one value).
    const splitCountries = seniorities.length > 1 && countryIncludes.length > 1;
    if (!splitCountries) addOrLower("p.country", countryIncludes);
    addNoneLower("p.country", countryExcludes);
    addLocationOr(locationIncludes);
    addLocationNone(locationExcludes);
    addFtsOr(companyIncludes);
    addNone("p.company_name", companyExcludes, true);
    addOr("c.industry",      industryIncludes, true);
    addNone("c.industry",    industryExcludes, true);
    addOrExact("c.size_range", companySizes);
    addOr("c.keywords",  companyKeywordIncludes, true);
    addNone("c.keywords", companyKeywordExcludes, true);

    if (emailStatus === "has_email") {
      conditions.push(`p.email IS NOT NULL AND p.email <> ''`);
    }

    // Cap the array size we push into the WHERE. Above this threshold, the
    // hashed `<> ALL($::text[])` shape still works but the network payload
    // and per-request planning cost grow linearly. For huge established
    // workspaces we keep the most-recent slice in the anti-join and let any
    // dupes slip through — the client-side dedup on export catches them and
    // the UX cost is bounded ("a few dupes I already scraped" vs "search
    // times out and returns nothing").
    const NET_NEW_ARRAY_CAP = 20_000;

    let netNewEmails: string[] = [];
    if (netNew) {
      // Cache the workspace's existing-email set for 60s (see discover-cache.ts).
      // Cuts a Supabase RPC round-trip on every filter tweak.
      let existingEmails = await getCachedWorkspaceEmails(workspaceId);
      if (existingEmails === null) {
        const adminDb = createAdminClient();
        const { data: emailArray } = await adminDb
          .rpc("get_workspace_lead_emails", { p_workspace_id: workspaceId });
        existingEmails = ((emailArray as string[] | null) ?? []).filter(Boolean);
        void setCachedWorkspaceEmails(workspaceId, existingEmails);
      }
      if (existingEmails.length > NET_NEW_ARRAY_CAP) {
        // Keep the tail — get_workspace_lead_emails does not sort, but slicing
        // from the end still gives a stable subset that's the same across
        // repeated searches within the cache window, avoiding pagination flicker.
        existingEmails = existingEmails.slice(-NET_NEW_ARRAY_CAP);
      }
      if (existingEmails.length > 0) {
        // Use `<> ALL($::text[])` instead of `NOT IN (SELECT unnest(...))`.
        // With large arrays the planner picks a much faster hashed-array
        // comparison for ALL than the row-source it derives from unnest, and
        // this is the pattern Postgres actually optimises for anti-set
        // membership. The NULL guard preserves rows with no email (previously
        // excluded accidentally by NOT IN's three-valued logic on NULL).
        conditions.push(`(p.email IS NULL OR lower(p.email) <> ALL($${i}::text[]))`);
        params.push(existingEmails);
        i++;
        netNewEmails = existingEmails;
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Drop the created_at ordering (and route through the flat path) for any
    // filter that can make the result sparse among recent rows — otherwise the
    // planner walks the created_at index and post-filters row by row until it
    // hits statement_timeout. Covers FTS text (keyword/title/company) plus the
    // company-side (industry / company keywords) and location filters. Plain
    // seniority/country searches keep recency ordering — their compound index
    // provides both the filter and the sort.
    // Use INNER JOIN when filtering on company attributes — lets the planner start
    // from the much smaller discover_companies table (industry GIN, size btree) and
    // then join to discover_people, instead of scanning all 559M people rows first.
    const hasCompanyFilter = industryIncludes.length > 0 || industryExcludes.length > 0
      || companySizes.length > 0
      || companyKeywordIncludes.length > 0 || companyKeywordExcludes.length > 0;
    const joinType = hasCompanyFilter ? "INNER JOIN" : "LEFT JOIN";

    // Drop created_at ordering whenever the query is NOT a plain people-side
    // structured search — i.e. any company-side filter (INNER JOIN, include OR
    // exclude) or any people-side text/location INCLUDE. Those either make the
    // result sparse among recent rows or add per-row join work, so keeping the
    // ordering traps the planner into a full recency scan → statement_timeout.
    // Plain seniority/country/department searches (and people-side EXCLUDEs with
    // no join, which barely reduce the set) keep recency ordering — fast via the
    // compound index or a cheap post-filter.
    const dropOrder = hasCompanyFilter
      || !!keyword
      || titleIncludes.length > 0
      || companyIncludes.length > 0
      || departments.length > 0
      || locationIncludes.length > 0;
    const forceFlat = dropOrder;

    // When multiple seniority values are selected the planner ignores the seniority
    // composite index and falls back to a full country-scan (or created_at scan) that
    // times out on large markets like Nigeria. Generate one sub-query per seniority
    // value so each sub-query drives discover_people_seniority_created_idx directly,
    // then UNION ALL the results and re-sort in memory over a tiny merged set.
    const multiSen = seniorities.length > 1 ? seniorities : null;

    // For each seniority value, the subquery param index is i + <value_index>.
    // After all seniority params: limit is at i + seniorities.length (or i for single).
    const senLenForParams = multiSen ? multiSen.length : 0;

    // Extend the base WHERE with seniority/country ANY() clauses for count + idsOnly paths.
    // These already have timeout fallbacks so a slower plan is acceptable there.
    const whereWithAnySen = multiSen
      ? `${where ? `${where} AND ` : "WHERE "}lower(p.seniority) = ANY($${i}::text[])`
      : where;
    const anySenParams = multiSen ? [...params, multiSen.map(s => s.toLowerCase())] : params;
    // When countries were pulled out of base WHERE (splitCountries), re-add them for the
    // count + idsOnly paths via ANY so those queries still filter correctly.
    const whereForSimplePaths = splitCountries
      ? `${whereWithAnySen} AND lower(p.country) = ANY($${i + 1}::text[])`
      : whereWithAnySen;
    const paramsForSimplePaths = splitCountries
      ? [...anySenParams, countryIncludes.map(c => c.toLowerCase())]
      : anySenParams;
    // How many extra params were appended for the simple-path ANY conditions
    const simpleExtraParams = splitCountries ? 2 : multiSen ? 1 : 0;

    // Build one sub-query string for each seniority value (UNION ALL data path).
    // i + idx maps to the seniority value param; each sub-query is independently
    // planned so the planner drives the seniority_created_idx for each value.
    const DATA_SELECT = `
      p.id, p.first_name, p.last_name, p.title, p.seniority, p.department,
      p.linkedin_url, p.email, p.email_status, p.phone,
      p.country, p.state, p.city, p.company_name, p.company_id,
      c.domain AS company_domain,
      c.industry AS company_industry, c.size_range AS company_size,
      c.keywords AS company_keywords,
      p.created_at AS _sort_at`;

    function buildUnionSubqueries(neededEach: number): string {
      if (splitCountries) {
        // One subquery per (seniority × country) pair — each gets exact equality on both
        // columns so the planner uses discover_people_sen_country_created_idx directly.
        const combos = (multiSen ?? []).flatMap(sen => countryIncludes.map(ctry => ({ sen, ctry })));
        return combos.map(({ sen, ctry }, idx) => {
          const senParam  = `$${i + idx * 2}`;
          const ctryParam = `$${i + idx * 2 + 1}`;
          const subWhere = where
            ? `${where} AND lower(p.seniority) = lower(${senParam}) AND lower(p.country) = lower(${ctryParam})`
            : `WHERE lower(p.seniority) = lower(${senParam}) AND lower(p.country) = lower(${ctryParam})`;
          return `(SELECT ${DATA_SELECT} FROM discover_people p ${joinType} discover_companies c ON c.id = p.company_id ${subWhere} ORDER BY p.created_at DESC NULLS LAST LIMIT ${neededEach})`;
        }).join(" UNION ALL ");
      }
      return (multiSen ?? []).map((_, idx) => {
        const senWhere = where ? `${where} AND lower(p.seniority) = lower($${i + idx})` : `WHERE lower(p.seniority) = lower($${i + idx})`;
        return `(SELECT ${DATA_SELECT} FROM discover_people p ${joinType} discover_companies c ON c.id = p.company_id ${senWhere} ORDER BY p.created_at DESC NULLS LAST LIMIT ${neededEach})`;
      }).join(" UNION ALL ");
    }

    // Outer ORDER BY for UNION ALL: strip table aliases (p./c.) for the derived table.
    // created_at is aliased as _sort_at; all other sort cols exist under their own names.
    const outerSortExpr = sortRaw === "created_at"
      ? "_sort_at"
      : sortCol.split(",").map(s => s.trim().replace(/^[pc]\./, "")).join(", ");

    // Lightweight ID-only path — used by the frontend's "select all" bulk operations.
    // Returns raw IDs without reveal lookups or email masking, supporting up to 50k.
    if (idsOnly) {
      // ── Chunked company-driven collection ──
      // When company-side filters are combined with people-side predicates, the
      // flat query builds multi-million-row bitmaps (title trigram × country)
      // that cannot early-terminate under LIMIT and hit statement_timeout.
      // Instead: fetch the matching company ids first (cheap trigram/btree,
      // ~1s even at 50k), then probe people in small company batches — each
      // statement is a fast company_idx bitmap probe with LIMIT early-exit.
      // The sweep is RESUMABLE: each request processes companies for at most
      // ~35s from `comp_offset` and returns `next_comp_offset` + `done`, and
      // the client loops until it has enough ids or every company was swept.
      // Text predicates use per-row ILIKE here (cheap on the small probed
      // sets) rather than FTS, which is close enough for bulk selection.
      if (hasCompanyFilter) {
        const compOffset = Math.max(0, parseInt(p.get("comp_offset") || "0"));
        const compConds: string[] = [];
        const compParams: unknown[] = [];
        let ci = 1;
        if (industryIncludes.length) {
          compConds.push(`(${industryIncludes.map(() => `c.industry ILIKE $${ci++}`).join(" OR ")})`);
          compParams.push(...industryIncludes.map(v => `%${v}%`));
        }
        if (industryExcludes.length) {
          compConds.push(`NOT (${industryExcludes.map(() => `c.industry ILIKE $${ci++}`).join(" OR ")})`);
          compParams.push(...industryExcludes.map(v => `%${v}%`));
        }
        if (companySizes.length) {
          compConds.push(`lower(c.size_range) = ANY($${ci++}::text[])`);
          compParams.push(companySizes.map(s => s.toLowerCase()));
        }
        if (companyKeywordIncludes.length) {
          compConds.push(`(${companyKeywordIncludes.map(() => `c.keywords ILIKE $${ci++}`).join(" OR ")})`);
          compParams.push(...companyKeywordIncludes.map(v => `%${v}%`));
        }
        if (companyKeywordExcludes.length) {
          compConds.push(`NOT (${companyKeywordExcludes.map(() => `c.keywords ILIKE $${ci++}`).join(" OR ")})`);
          compParams.push(...companyKeywordExcludes.map(v => `%${v}%`));
        }
        // ORDER BY id keeps the sweep order deterministic across resumed
        // requests — without it, comp_offset would index into a different set.
        const compRows = await leadsDb.unsafe<{ id: string }[]>(
          `SELECT c.id FROM discover_companies c WHERE ${compConds.join(" AND ")} ORDER BY c.id LIMIT 50000`,
          compParams as never[],
        );
        const compIds = compRows.map(r => r.id);
        if (compOffset >= compIds.length) return NextResponse.json({ ids: [], next_comp_offset: compIds.length, companies_total: compIds.length, done: true });

        // People-side WHERE — $1 is reserved for the per-chunk company-id array.
        const pConds: string[] = [`p.company_id = ANY($1::uuid[])`];
        const pParams: unknown[] = [];
        let pi = 2;
        if (keyword) {
          pConds.push(`(p.title ILIKE $${pi} OR p.company_name ILIKE $${pi})`);
          pParams.push(`%${keyword}%`); pi++;
        }
        if (titleIncludes.length) {
          pConds.push(`p.title ILIKE ANY($${pi++}::text[])`);
          pParams.push(titleIncludes.map(v => `%${v}%`));
        }
        if (titleExcludes.length) {
          pConds.push(`NOT (p.title ILIKE ANY($${pi++}::text[]))`);
          pParams.push(titleExcludes.map(v => `%${v}%`));
        }
        if (seniorities.length) {
          pConds.push(`lower(p.seniority) = ANY($${pi++}::text[])`);
          pParams.push(seniorities.map(s => s.toLowerCase()));
        }
        if (senioritiesExclude.length) {
          pConds.push(`NOT (lower(p.seniority) = ANY($${pi++}::text[]))`);
          pParams.push(senioritiesExclude.map(s => s.toLowerCase()));
        }
        if (departments.length) {
          pConds.push(`p.department ILIKE ANY($${pi++}::text[])`);
          pParams.push(departments.map(v => `%${v}%`));
        }
        if (departmentsExclude.length) {
          pConds.push(`NOT (p.department ILIKE ANY($${pi++}::text[]))`);
          pParams.push(departmentsExclude.map(v => `%${v}%`));
        }
        if (countryIncludes.length) {
          pConds.push(`lower(p.country) = ANY($${pi++}::text[])`);
          pParams.push(countryIncludes.map(c => c.toLowerCase()));
        }
        if (countryExcludes.length) {
          pConds.push(`NOT (lower(p.country) = ANY($${pi++}::text[]))`);
          pParams.push(countryExcludes.map(c => c.toLowerCase()));
        }
        for (const loc of locationIncludes) {
          pConds.push(`(p.country ILIKE $${pi} OR p.state ILIKE $${pi} OR p.city ILIKE $${pi})`);
          pParams.push(`%${loc}%`); pi++;
        }
        for (const loc of locationExcludes) {
          pConds.push(`NOT (p.country ILIKE $${pi} OR p.state ILIKE $${pi} OR p.city ILIKE $${pi})`);
          pParams.push(`%${loc}%`); pi++;
        }
        if (companyIncludes.length) {
          pConds.push(`p.company_name ILIKE ANY($${pi++}::text[])`);
          pParams.push(companyIncludes.map(v => `%${v}%`));
        }
        if (companyExcludes.length) {
          pConds.push(`NOT (p.company_name ILIKE ANY($${pi++}::text[]))`);
          pParams.push(companyExcludes.map(v => `%${v}%`));
        }
        if (emailStatus === "has_email") {
          pConds.push(`p.email IS NOT NULL AND p.email <> ''`);
        }
        if (netNewEmails.length) {
          pConds.push(`(p.email IS NULL OR lower(p.email) <> ALL($${pi++}::text[]))`);
          pParams.push(netNewEmails);
        }
        const chunkSql = `
          SELECT p.id FROM discover_people p
          WHERE ${pConds.join(" AND ")}
          LIMIT $${pi}
        `;

        // Chunk sizing is bounded by the pool's 25s statement_timeout: a
        // 300-company probe measured ~11-18s cold on the heaviest real filter
        // combo (large US companies, cold page cache). Chunks run sequentially —
        // concurrent chunks compete for disk I/O and both breach the timeout.
        // A chunk that times out is retried once at half size before being
        // skipped, so a few oversized companies can't sink the whole selection.
        const CHUNK = 300;
        const BUDGET_MS = 35_000;
        const started = Date.now();
        const collected: string[] = [];
        let failedChunks = 0;
        let s = compOffset;
        for (; s < compIds.length && collected.length < limit && Date.now() - started < BUDGET_MS; s += CHUNK) {
          const batch = compIds.slice(s, s + CHUNK);
          const remaining = limit - collected.length;
          const firstTry = await leadsDb.unsafe<{ id: string }[]>(chunkSql, [batch, ...pParams, remaining] as never[])
            .catch(() => null);
          let rows: { id: string }[];
          if (firstTry !== null) {
            rows = firstTry;
          } else {
            // Retry in two half-size statements; skip whatever still fails.
            const retryRows: { id: string }[] = [];
            for (const half of [batch.slice(0, CHUNK / 2), batch.slice(CHUNK / 2)]) {
              if (!half.length || retryRows.length >= remaining) continue;
              const sub = await leadsDb.unsafe<{ id: string }[]>(
                chunkSql, [half, ...pParams, remaining - retryRows.length] as never[],
              ).catch(() => { failedChunks++; return [] as { id: string }[]; });
              retryRows.push(...sub);
            }
            rows = retryRows;
          }
          for (const r of rows) {
            if (collected.length >= limit) break;
            collected.push(r.id);
          }
        }
        // A first round where every chunk failed is systemic — surface it.
        // Later rounds return their cursor even when empty (normal during
        // net-new sweeps over already-imported companies).
        if (!collected.length && failedChunks > 0 && compOffset === 0) {
          return NextResponse.json({
            error: "This selection is too heavy for the current filters. Try fewer filters or a smaller count.",
          }, { status: 500 });
        }
        return NextResponse.json({
          ids:              collected,
          next_comp_offset: s,
          companies_total:  compIds.length,
          done:             s >= compIds.length,
        });
      }

      const idSql = `
        SELECT p.id
        FROM discover_people p
        ${joinType} discover_companies c ON c.id = p.company_id
        ${whereForSimplePaths}
        ${dropOrder ? "" : "ORDER BY p.created_at DESC NULLS LAST"}
        LIMIT $${i + simpleExtraParams}
      `;
      const idRows = await leadsDb.unsafe<{ id: string }[]>(
        idSql, [...paramsForSimplePaths, limit] as never[],
      );
      return NextResponse.json({ ids: idRows.map(r => r.id) });
    }

    const HARD_CAP = 50_000;

    // Count races against a 12s timer — if counting is slow (broad filter, index still
    // building), the data still loads and the UI shows "50,000+" as the total.
    // The abandoned DB query finishes in background; PgBouncer cleans it up within 120s.
    const countPromise = leadsDb.unsafe(`
        SELECT count(*) AS total
        FROM (
          SELECT 1 FROM discover_people p
          ${joinType} discover_companies c ON c.id = p.company_id
          ${whereForSimplePaths}
          LIMIT 100001
        ) cnt
      `, paramsForSimplePaths as never[])
      .then(rows => parseInt((rows[0] as unknown as { total: string }).total, 10))
      .catch((): number => HARD_CAP);

    const countWithTimeout = () => Promise.race([
      countPromise,
      new Promise<number>(resolve => setTimeout(() => resolve(HARD_CAP), 12_000)),
    ]);

    // When title ILIKE filters are present alongside multiple seniorities, the GIN trigram
    // index on p.title is more selective than the seniority+country compound index.
    // Using UNION ALL here would issue N × M separate bitmap heap scans (one per
    // seniority × country pair), each fetching ~30k scattered rows, which multiplies the
    // random I/O cost. Instead, fall back to a flat query: the GIN index drives a single
    // bitmap scan, then ANY() conditions apply seniority/country on the small result set.
    let dataPromise: Promise<Record<string, unknown>[]>;
    if (multiSen && !forceFlat) {
      const neededEach = offset + limit;
      let unionDataParams: unknown[];
      let limitIdx: number;
      let offsetIdx: number;
      if (splitCountries) {
        // (seniority × country) cartesian product — params alternate [sen, ctry, sen, ctry, ...]
        const comboParams = multiSen.flatMap(sen => countryIncludes.flatMap(ctry => [sen, ctry]));
        limitIdx  = i + comboParams.length;
        offsetIdx = i + comboParams.length + 1;
        unionDataParams = [...params, ...comboParams, limit, offset];
      } else {
        limitIdx  = i + senLenForParams;
        offsetIdx = i + senLenForParams + 1;
        unionDataParams = [...params, ...multiSen, limit, offset];
      }
      const unionSQL = `
        SELECT id, first_name, last_name, title, seniority, department,
          linkedin_url, email, email_status, phone,
          country, state, city, company_name, company_id,
          company_domain, company_industry, company_size, company_keywords
        FROM (${buildUnionSubqueries(neededEach)}) _u
        ORDER BY ${outerSortExpr} ${sortDir} NULLS LAST
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      dataPromise = leadsDb.unsafe<Record<string, unknown>[]>(
        unionSQL, unionDataParams as never[],
      );
    } else {
      // Flat query path: single seniority, OR GIN-path (title filters present with multi-sen).
      // Uses whereForSimplePaths which folds seniority/country into ANY() clauses.
      const flatWhere  = (multiSen && forceFlat) ? whereForSimplePaths : where;
      const flatParams = (multiSen && forceFlat) ? paramsForSimplePaths : params;
      const flatExtra  = (multiSen && forceFlat) ? simpleExtraParams : 0;
      dataPromise = leadsDb.unsafe<Record<string, unknown>[]>(`
          SELECT
            p.id, p.first_name, p.last_name, p.title, p.seniority, p.department,
            p.linkedin_url, p.email, p.email_status, p.phone,
            p.country, p.state, p.city, p.company_name, p.company_id,
            c.domain AS company_domain,
            c.industry AS company_industry, c.size_range AS company_size,
            c.keywords AS company_keywords
          FROM discover_people p
          ${joinType} discover_companies c ON c.id = p.company_id
          ${flatWhere}
          ${dropOrder ? "" : `ORDER BY ${sortCol} ${sortDir} NULLS LAST`}
          LIMIT $${i + flatExtra} OFFSET $${i + flatExtra + 1}
        `, [...flatParams, limit, offset] as never[]);
    }

    const dataWithTimeout = () => Promise.race([
      dataPromise,
      new Promise<Record<string, unknown>[]>(resolve =>
        setTimeout(() => resolve([]), 50_000)
      ),
    ]);

    const [rawTotal, rows] = await Promise.all([
      skipCount ? Promise.resolve(-1) : countWithTimeout(),
      dataWithTimeout(),
    ]);

    const capped   = !skipCount && rawTotal >= HARD_CAP;
    const total    = capped ? HARD_CAP : rawTotal;
    const personIds = (rows as Record<string, unknown>[]).map(r => r.id as string);

    const adminDb = createAdminClient();
    const revealMap = new Map<string, { email: string | null; phone: string | null; email_status: string | null; exported: boolean }>();
    if (personIds.length > 0) {
      const { data: revealRows } = await adminDb
        .from("discover_reveals")
        .select("person_id, email, phone, email_status, exported_at")
        .eq("workspace_id", workspaceId)
        .in("person_id", personIds);

      for (const r of (revealRows ?? [])) {
        revealMap.set(r.person_id, {
          email:        r.email,
          phone:        r.phone,
          email_status: r.email_status,
          exported:     !!r.exported_at,
        });
      }
    }

    const results: DiscoverResult[] = (rows as Record<string, unknown>[]).map((r) => {
      const rev = revealMap.get(r.id as string);
      const revealed = !!rev;
      return {
        id:               r.id               as string,
        company_id:       r.company_id       as string | null,
        first_name:       r.first_name       as string | null,
        last_name:        r.last_name        as string | null,
        title:            r.title            as string | null,
        seniority:        r.seniority        as string | null,
        department:       r.department       as string | null,
        linkedin_url:     r.linkedin_url     as string | null,
        email_status:     ((revealed ? rev!.email_status : r.email_status) as DiscoverResult["email_status"]) ?? "unverified",
        country:          r.country          as string | null,
        state:            r.state            as string | null,
        city:             r.city             as string | null,
        company_name:     r.company_name     as string | null,
        company_domain:   r.company_domain   as string | null,
        company_industry: r.company_industry as string | null,
        company_size:     r.company_size     as string | null,
        company_keywords: r.company_keywords as string | null,
        email_preview:    revealed ? rev!.email : maskEmail(r.email as string | null),
        phone_preview:    revealed ? rev!.phone : maskPhone(r.phone as string | null),
        has_email:        !!(r.email),
        has_phone:        !!(r.phone),
        revealed,
        exported:         rev?.exported ?? false,
      };
    });

    const responseData = {
      results, total, page, limit, credits_per_lead: CREDITS_PER_LEAD,
      ...(capped ? { message: "Too many results. Please refine your filters to see accurate counts." } : {}),
    } satisfies DiscoverSearchResponse;

    // Store in cache (fire-and-forget — don't delay the response)
    if (cKey) void setCachedSearch(cKey, responseData);

    return NextResponse.json(responseData);
  } catch (err) {
    // Classify the failure so the customer sees an actionable message.
    // postgres.js surfaces the SQLSTATE code on err.code.
    const errObj = err as { code?: string; severity?: string; message?: string };
    const code   = errObj.code ?? "";
    const msg    = errObj.message ?? String(err);

    const fingerprint = {
      workspace: workspaceId,
      code,
      severity: errObj.severity,
      filters: {
        keyword:      !!keyword,
        titles:       titleIncludes.length,
        seniorities:  seniorities.length,
        departments:  departments.length,
        countries:    countryIncludes.length,
        locations:    locationIncludes.length,
        industries:   industryIncludes.length,
        sizes:        companySizes.length,
        companies:    companyIncludes.length,
        co_keywords:  companyKeywordIncludes.length,
        net_new:      netNew,
        ids_only:     idsOnly,
      },
      msg: msg.slice(0, 200),
    };
    console.error("[discover/search]", JSON.stringify(fingerprint));

    if (code === "57014") {
      return NextResponse.json({
        error: "This search took too long. Try narrower filters — fewer titles, tighter countries, or a specific industry — and try again.",
      }, { status: 504 });
    }
    if (code.startsWith("08")) {
      return NextResponse.json({
        error: "Lost the connection to the leads database. Please try again in a moment.",
      }, { status: 503 });
    }
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
