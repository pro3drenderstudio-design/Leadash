import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import leadsDb from "@/lib/postgres/leads-db";
import {
  searchCacheKey, getCachedSearch, setCachedSearch, checkDiscoverRateLimit,
  getCachedWorkspaceEmails, setCachedWorkspaceEmails,
} from "@/lib/discover-cache";
import type { DiscoverSearchResponse, DiscoverResult } from "@/types/discover";

const CREDITS_PER_LEAD = 0.5;
const DEFAULT_LIMIT    = 25;
const MAX_LIMIT        = 100;
const IDS_ONLY_MAX     = 50_000;

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

    if (keyword) {
      // first_name/last_name excluded until discover_people_first_name_trgm and
      // discover_people_last_name_trgm GIN indexes finish building (559M rows, ~4h).
      // title and company_name both have GIN trigram indexes (fast).
      conditions.push(`(p.title ILIKE $${i} OR p.company_name ILIKE $${i})`);
      params.push(`%${keyword}%`); i++;
    }
    addOr("p.title",      titleIncludes,   true);
    addNone("p.title",    titleExcludes,   true);
    addOrExact("p.seniority",   seniorities);
    addNoneExact("p.seniority", senioritiesExclude);
    addOr("p.department",  departments,        true);
    addNone("p.department", departmentsExclude, true);
    addOrLower("p.country",   countryIncludes);
    addNoneLower("p.country", countryExcludes);
    addLocationOr(locationIncludes);
    addLocationNone(locationExcludes);
    addOr("p.company_name",  companyIncludes,  true);
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
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Use INNER JOIN when filtering on company attributes — lets the planner start
    // from the much smaller discover_companies table (industry GIN, size btree) and
    // then join to discover_people, instead of scanning all 559M people rows first.
    const hasCompanyFilter = industryIncludes.length > 0 || industryExcludes.length > 0
      || companySizes.length > 0
      || companyKeywordIncludes.length > 0 || companyKeywordExcludes.length > 0;
    const joinType = hasCompanyFilter ? "INNER JOIN" : "LEFT JOIN";

    // Lightweight ID-only path — used by the frontend's "select all" bulk operations.
    // Returns raw IDs without reveal lookups or email masking, supporting up to 50k.
    if (idsOnly) {
      const idRows = await leadsDb.unsafe<{ id: string }[]>(`
        SELECT p.id
        FROM discover_people p
        ${joinType} discover_companies c ON c.id = p.company_id
        ${where}
        ORDER BY p.created_at DESC NULLS LAST
        LIMIT $${i}
      `, [...params, limit] as never[]);
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
          ${where}
          LIMIT 100001
        ) cnt
      `, params as never[])
      .then(rows => parseInt((rows[0] as unknown as { total: string }).total, 10))
      .catch((): number => HARD_CAP);

    const countWithTimeout = () => Promise.race([
      countPromise,
      new Promise<number>(resolve => setTimeout(() => resolve(HARD_CAP), 12_000)),
    ]);

    // Wrap the rows query so we can classify its failure (timeout vs
    // connection vs unknown) and return an actionable message instead of
    // the generic "Search failed" — that's what the customer keeps seeing.
    const rowsPromise = leadsDb.unsafe(`
      SELECT
        p.id, p.first_name, p.last_name, p.title, p.seniority, p.department,
        p.linkedin_url, p.email, p.email_status, p.phone,
        p.country, p.state, p.city, p.company_name, p.company_id,
        c.domain AS company_domain,
        c.industry AS company_industry, c.size_range AS company_size,
        c.keywords AS company_keywords
      FROM discover_people p
      ${joinType} discover_companies c ON c.id = p.company_id
      ${where}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT $${i} OFFSET $${i + 1}
    `, [...params, limit, offset] as never[]);

    const [rawTotal, rows] = await Promise.all([
      skipCount ? Promise.resolve(-1) : countWithTimeout(),
      rowsPromise,
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

    // Log a compact fingerprint (workspace + filter keys, no PII) so we can
    // triage timeouts vs connection drops server-side without a debugger.
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

    // 57014 = query_canceled (statement_timeout, hit our per-statement cap).
    // 08* = connection_exception / broken pipe from PgBouncer or the VPS.
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
