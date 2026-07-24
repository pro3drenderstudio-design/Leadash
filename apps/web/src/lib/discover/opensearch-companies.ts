import { osSearch } from "@/lib/postgres/leads-os";

/** Discover company-search → OpenSearch (`discover_companies` index). */

const INDEX = "discover_companies";

const SOURCE_FIELDS = [
  "name", "domain", "website_url", "linkedin_url", "industry", "size_range",
  "employee_count", "revenue_usd", "funding_stage", "funding_total",
  "country", "state", "city", "description", "keywords", "people_count",
];

function csv(val: string | null | undefined): string[] {
  const v = (val || "").trim();
  if (!v) return [];
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

type Clause = Record<string, unknown>;

function matchShould(field: string, values: string[]): Clause {
  return {
    bool: {
      should: values.map(v => ({ match: { [field]: { query: v, operator: "and" } } })),
      minimum_should_match: 1,
    },
  };
}

export interface OsCompanyQueryOpts {
  from: number;
  size: number;
  sort: string;
  order: "asc" | "desc";
  idsOnly?: boolean;
  trackTotal?: boolean | number;
}

export function buildCompanyQuery(p: URLSearchParams, opts: OsCompanyQueryOpts): Record<string, unknown> {
  const keyword          = p.get("q")?.trim() || null;
  const industryIncludes = csv(p.get("industry_include"));
  const industryExcludes = csv(p.get("industry_exclude"));
  const companySizes     = csv(p.get("company_size")).map(s => s.toLowerCase());
  const countryIncludes  = csv(p.get("country_include")).map(s => s.toLowerCase());
  const countryExcludes  = csv(p.get("country_exclude")).map(s => s.toLowerCase());
  const locationIncludes = csv(p.get("location_include"));
  const locationExcludes = csv(p.get("location_exclude"));
  const fundingStages    = csv(p.get("funding_stage")).map(s => s.toLowerCase());
  const keywordIncludes  = csv(p.get("keyword_include"));
  const keywordExcludes  = csv(p.get("keyword_exclude"));
  const employeeMin      = parseInt(p.get("employee_min") || "0") || 0;
  const employeeMax      = parseInt(p.get("employee_max") || "0") || 0;
  const revenueMin       = parseInt(p.get("revenue_min") || "0") || 0;
  const revenueMax       = parseInt(p.get("revenue_max") || "0") || 0;
  const hasPeople        = p.get("has_people") === "true";

  const must: Clause[]    = [];
  const filter: Clause[]  = [];
  const mustNot: Clause[] = [];

  if (keyword) {
    must.push({
      multi_match: { query: keyword, fields: ["name", "domain.txt", "description", "keywords"] },
    });
  }
  if (industryIncludes.length)  must.push(matchShould("industry", industryIncludes));
  if (locationIncludes.length)  must.push(matchShould("location", locationIncludes));
  if (keywordIncludes.length)   must.push(matchShould("keywords", keywordIncludes));

  if (companySizes.length)   filter.push({ terms: { size_range: companySizes } });
  if (countryIncludes.length) filter.push({ terms: { country: countryIncludes } });
  if (fundingStages.length)  filter.push({ terms: { funding_stage: fundingStages } });
  if (hasPeople)             filter.push({ range: { people_count: { gt: 0 } } });
  if (employeeMin > 0)       filter.push({ range: { employee_count: { gte: employeeMin } } });
  if (employeeMax > 0)       filter.push({ range: { employee_count: { lte: employeeMax } } });
  if (revenueMin > 0)        filter.push({ range: { revenue_usd: { gte: revenueMin } } });
  if (revenueMax > 0)        filter.push({ range: { revenue_usd: { lte: revenueMax } } });

  for (const v of industryExcludes) mustNot.push({ match: { industry: { query: v, operator: "and" } } });
  for (const v of locationExcludes) mustNot.push({ match: { location: { query: v, operator: "and" } } });
  for (const v of keywordExcludes)  mustNot.push({ match: { keywords: { query: v, operator: "and" } } });
  if (countryExcludes.length) mustNot.push({ terms: { country: countryExcludes } });

  const SORT_FIELDS: Record<string, string[]> = {
    name:         ["name_sort"],
    industry:     ["industry.kw"],
    size:         ["employee_count"],
    location:     ["country"],
    people_count: ["people_count"],
    revenue:      ["revenue_usd"],
  };
  const sortCols = SORT_FIELDS[opts.sort] ?? ["people_count"];
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

export interface OsCompanyRow {
  id: string;
  name: string;
  domain: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  size_range: string | null;
  employee_count: number | null;
  revenue_usd: number | null;
  funding_stage: string | null;
  funding_total: number | null;
  country: string | null;
  state: string | null;
  city: string | null;
  description: string | null;
  keywords: string | null;
  people_count: number;
}

export async function osCompanySearch(
  p: URLSearchParams,
  opts: OsCompanyQueryOpts,
  timeoutMs = 30_000,
): Promise<{ total: number; rows: OsCompanyRow[] }> {
  const body = buildCompanyQuery(p, opts);
  const res = await osSearch<Omit<OsCompanyRow, "id">>(INDEX, body, timeoutMs);
  const rows: OsCompanyRow[] = res.hits.hits.map(h => ({
    id: h._id,
    ...(h._source as Omit<OsCompanyRow, "id">),
    people_count: (h._source as { people_count?: number }).people_count ?? 0,
  }));
  return { total: res.hits.total.value, rows };
}

export async function osCompanyIds(
  p: URLSearchParams,
  limit: number,
  timeoutMs = 30_000,
): Promise<string[]> {
  const body = buildCompanyQuery(p, {
    from: 0, size: limit, sort: "name", order: "asc", idsOnly: true, trackTotal: false,
  });
  const res = await osSearch<unknown>(INDEX, body, timeoutMs);
  return res.hits.hits.map(h => h._id);
}
