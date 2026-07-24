import { osSearch } from "@/lib/postgres/leads-os";

/**
 * Translates the Discover people-search filter set into an OpenSearch query and
 * runs it against the `discover_people` index (denormalized: company fields are
 * flattened onto each person doc, so there is no join). Replaces the multi-path
 * Postgres query builder — OpenSearch gives fast cold queries and exact counts.
 */

const INDEX = "discover_people";

// Fields returned in _source — everything the results grid + reveal masking need.
const SOURCE_FIELDS = [
  "first_name", "last_name", "title", "seniority", "department", "linkedin_url",
  "email", "email_status", "phone", "country", "state", "city",
  "company_name", "company_domain", "company_industry", "company_size",
  "company_keywords", "company_id", "created_at",
];

function csv(val: string | null | undefined): string[] {
  const v = (val || "").trim();
  if (!v) return [];
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

type Clause = Record<string, unknown>;

// OR of full-text matches on title+company_name (mirrors the Postgres FTS_EXPR,
// which covers title + company_name together). operator:"and" = all words match.
function ftsShould(values: string[]): Clause {
  return {
    bool: {
      should: values.map(v => ({
        multi_match: { query: v, fields: ["title", "company_name"], operator: "and" },
      })),
      minimum_should_match: 1,
    },
  };
}

// OR of match queries on a single text field.
function matchShould(field: string, values: string[]): Clause {
  return {
    bool: {
      should: values.map(v => ({ match: { [field]: { query: v, operator: "and" } } })),
      minimum_should_match: 1,
    },
  };
}

export interface OsPeopleQueryOpts {
  from: number;
  size: number;
  sort: string;
  order: "asc" | "desc";
  trackTotal?: boolean | number;
  idsOnly?: boolean;
}

export function buildPeopleQuery(
  p: URLSearchParams,
  netNewEmails: string[],
  opts: OsPeopleQueryOpts,
): Record<string, unknown> {
  const keyword          = p.get("q")?.trim() || null;
  const titleIncludes    = csv(p.get("title_include"));
  const titleExcludes    = csv(p.get("title_exclude"));
  const seniorities        = csv(p.get("seniority")).map(s => s.toLowerCase());
  const senioritiesExclude = csv(p.get("seniority_exclude")).map(s => s.toLowerCase());
  const departments        = csv(p.get("department"));
  const departmentsExclude = csv(p.get("department_exclude"));
  const countryIncludes  = csv(p.get("country_include")).map(s => s.toLowerCase());
  const countryExcludes  = csv(p.get("country_exclude")).map(s => s.toLowerCase());
  const locationIncludes = csv(p.get("location_include"));
  const locationExcludes = csv(p.get("location_exclude"));
  const companyIncludes  = csv(p.get("company_include"));
  const companyExcludes  = csv(p.get("company_exclude"));
  const industryIncludes = csv(p.get("industry_include"));
  const industryExcludes = csv(p.get("industry_exclude"));
  const companySizes           = csv(p.get("company_size")).map(s => s.toLowerCase());
  const companyKeywordIncludes = csv(p.get("co_keyword_include"));
  const companyKeywordExcludes = csv(p.get("co_keyword_exclude"));
  const emailStatus            = p.get("email_status") || "any";

  const must: Clause[]     = [];
  const filter: Clause[]   = [];
  const mustNot: Clause[]  = [];

  if (keyword)                     must.push(ftsShould([keyword]));
  if (titleIncludes.length)        must.push(ftsShould(titleIncludes));
  if (companyIncludes.length)      must.push(ftsShould(companyIncludes));
  if (departments.length)          must.push(matchShould("department", departments));
  if (locationIncludes.length)     must.push(matchShould("location", locationIncludes));
  if (industryIncludes.length)     must.push(matchShould("company_industry", industryIncludes));
  if (companyKeywordIncludes.length) must.push(matchShould("company_keywords", companyKeywordIncludes));

  if (seniorities.length)  filter.push({ terms: { seniority: seniorities } });
  if (countryIncludes.length) filter.push({ terms: { country: countryIncludes } });
  if (companySizes.length) filter.push({ terms: { company_size: companySizes } });
  if (emailStatus === "has_email") filter.push({ term: { has_email: true } });

  for (const v of titleExcludes)          mustNot.push({ match: { title: { query: v, operator: "and" } } });
  for (const v of departmentsExclude)     mustNot.push({ match: { department: { query: v, operator: "and" } } });
  for (const v of locationExcludes)        mustNot.push({ match: { location: { query: v, operator: "and" } } });
  for (const v of companyExcludes)         mustNot.push({ match: { company_name: { query: v, operator: "and" } } });
  for (const v of industryExcludes)        mustNot.push({ match: { company_industry: { query: v, operator: "and" } } });
  for (const v of companyKeywordExcludes)  mustNot.push({ match: { company_keywords: { query: v, operator: "and" } } });
  if (senioritiesExclude.length) mustNot.push({ terms: { seniority: senioritiesExclude } });
  if (countryExcludes.length)    mustNot.push({ terms: { country: countryExcludes } });
  // net-new / exclude-ws: drop leads whose email is already in the workspace.
  if (netNewEmails.length)       mustNot.push({ terms: { email: netNewEmails.map(e => e.toLowerCase()) } });

  const SORT_FIELDS: Record<string, string[]> = {
    name:         ["name_sort"],
    title:        ["title.kw"],
    company_name: ["company_name.kw"],
    location:     ["country", "city"],
    email_status: ["email_status"],
    created_at:   ["created_at"],
  };
  const sortCols = SORT_FIELDS[opts.sort] ?? ["created_at"];
  const sort = sortCols.map(f => ({ [f]: { order: opts.order, missing: "_last" } }));

  const body: Record<string, unknown> = {
    from: opts.from,
    size: opts.size,
    track_total_hits: opts.trackTotal ?? true,
    query: { bool: { must, filter, must_not: mustNot } },
    sort,
  };
  body._source = opts.idsOnly ? false : SOURCE_FIELDS;
  return body;
}

export interface OsPersonRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  linkedin_url: string | null;
  email: string | null;
  email_status: string | null;
  phone: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  company_name: string | null;
  company_id: string | null;
  company_domain: string | null;
  company_industry: string | null;
  company_size: string | null;
  company_keywords: string | null;
}

export async function osPeopleSearch(
  p: URLSearchParams,
  netNewEmails: string[],
  opts: OsPeopleQueryOpts,
  timeoutMs = 30_000,
): Promise<{ total: number; rows: OsPersonRow[] }> {
  // Exact "Apollo-style" totals — OpenSearch counts even tens of millions of
  // matches in a few ms, so surface the real number rather than a "50k+" cap.
  const body = buildPeopleQuery(p, netNewEmails, { ...opts, trackTotal: true });
  const res = await osSearch<Omit<OsPersonRow, "id">>(INDEX, body, timeoutMs);
  const rows: OsPersonRow[] = res.hits.hits.map(h => ({ id: h._id, ...(h._source as Omit<OsPersonRow, "id">) }));
  return { total: res.hits.total.value, rows };
}

export async function osPeopleIds(
  p: URLSearchParams,
  netNewEmails: string[],
  limit: number,
  timeoutMs = 30_000,
): Promise<string[]> {
  const body = buildPeopleQuery(p, netNewEmails, {
    from: 0, size: limit, sort: "created_at", order: "desc", trackTotal: false, idsOnly: true,
  });
  const res = await osSearch<unknown>(INDEX, body, timeoutMs);
  return res.hits.hits.map(h => h._id);
}
