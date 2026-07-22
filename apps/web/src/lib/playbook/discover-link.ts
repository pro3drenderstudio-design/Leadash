import { INDUSTRY_OPTIONS, COMPANY_SIZE_OPTIONS } from "@/types/discover";
import { COUNTRY_OPTIONS } from "@/app/(app)/discover/DiscoverFilters";

// Maps an ICP's fields onto Discover's URL search params (see filtersFromParams
// in the discover page) so "Find leads" opens Discover pre-filtered and
// auto-runs the search. Free-text fields are mapped best-effort: values that
// don't fit the Discover vocabulary are simply skipped rather than producing a
// filter that silently matches nothing.

const COUNTRY_ALIASES: Record<string, string> = {
  "us": "United States", "usa": "United States", "america": "United States",
  "united states of america": "United States",
  "uk": "United Kingdom", "england": "United Kingdom", "britain": "United Kingdom",
  "great britain": "United Kingdom",
  "uae": "United Arab Emirates", "dubai": "United Arab Emirates",
};

function matchCountries(geography: string): string[] {
  const tokens = geography.split(/[,&/]|\band\b/i).map(t => t.trim()).filter(Boolean);
  const out: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const aliased = COUNTRY_ALIASES[lower];
    const exact = aliased ?? COUNTRY_OPTIONS.find(c => c.toLowerCase() === lower);
    if (exact && !out.includes(exact)) out.push(exact);
  }
  return out;
}

function matchIndustry(industry: string): string | null {
  const lower = industry.trim().toLowerCase();
  if (!lower) return null;
  const exact = INDUSTRY_OPTIONS.find(o => o.toLowerCase() === lower);
  if (exact) return exact;
  // "Real estate agencies" → "Real Estate"; "IT" stays unmatched (too short/ambiguous)
  const partial = INDUSTRY_OPTIONS.find(o => lower.includes(o.toLowerCase()) || (lower.length >= 4 && o.toLowerCase().includes(lower)));
  return partial ?? null;
}

function matchSizes(companySize: string): string[] {
  return COMPANY_SIZE_OPTIONS.filter(range => companySize.includes(range));
}

function splitRoles(roles: string): string[] {
  return roles.split(/[,/]|\band\b/i).map(r => r.trim()).filter(Boolean).slice(0, 6);
}

export function icpToDiscoverUrl(icp: {
  industry:     string | null;
  company_size: string | null;
  geography:    string | null;
  roles:        string | null;
}): string {
  const p = new URLSearchParams();

  const titles = icp.roles ? splitRoles(icp.roles) : [];
  if (titles.length) p.set("ti", titles.join(","));

  const industry = icp.industry ? matchIndustry(icp.industry) : null;
  if (industry) p.set("ind", industry);

  const sizes = icp.company_size ? matchSizes(icp.company_size) : [];
  if (sizes.length) p.set("sz", sizes.join(","));

  const countries = icp.geography ? matchCountries(icp.geography) : [];
  if (countries.length) p.set("ctry", countries.join(","));

  const qs = p.toString();
  return qs ? `/discover?${qs}` : "/discover";
}
