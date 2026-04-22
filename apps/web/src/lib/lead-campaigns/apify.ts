// ─── Apify REST API v2 — pipelinelabs lead scraper ───────────────────────────

import type { ApifyLeadScraperInput } from "@/types/lead-campaigns";

const APIFY_BASE  = "https://api.apify.com/v2";
export const LEAD_SCRAPER_ACTOR = "pipelinelabs~lead-scraper-apollo-zoominfo-lusha-ppe";

export interface ApifyRunStatus {
  status:    "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMING-OUT" | "TIMED-OUT";
  datasetId: string | null;
}

// Exact field definitions from actor output schema
export interface ApifyLeadRecord {
  // Person
  firstName?:          string;
  lastName?:           string;
  fullName?:           string;
  title?:              string;   // Job title (actor field name)
  position?:           string;   // Alternate job title field
  seniority?:          string;
  functions?:          string[];  // Department / functional area (array)
  functional?:         string;   // Legacy functional field
  linkedinUrl?:        string;
  email?:              string;
  phone?:              string;
  personCity?:         string;
  personState?:        string;
  personCountry?:      string;
  // Company
  companyName?:        string;
  companyIndustry?:    string | string[];
  companyDomain?:      string;
  companyLinkedinUrl?: string;
  companyCity?:        string;
  companyState?:       string;
  companyCountry?:     string;
  companySize?:        number | string;
  companySizeRange?:   string;
  companyDescription?: string;
  foundedYear?:        number | string;
  [key: string]: unknown;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function startLeadScraperRun(
  apiKey: string,
  input:  ApifyLeadScraperInput,
): Promise<string> {
  const res = await fetch(
    `${APIFY_BASE}/acts/${LEAD_SCRAPER_ACTOR}/runs?token=${apiKey}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(input),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Lead scraper run failed: ${(err as { error?: { message?: string } })?.error?.message ?? res.statusText}`);
  }
  const { data } = await res.json();
  return data.id as string;
}

export async function getApifyRunStatus(
  apiKey: string,
  runId:  string,
): Promise<ApifyRunStatus> {
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apiKey}`);
  if (!res.ok) throw new Error(`Lead scraper status check failed: ${res.statusText}`);
  const { data } = await res.json();
  return {
    status:    data.status as ApifyRunStatus["status"],
    datasetId: data.defaultDatasetId ?? null,
  };
}

export async function fetchApifyDataset(
  apiKey:    string,
  datasetId: string,
  limit      = 1000,
  offset     = 0,
): Promise<ApifyLeadRecord[]> {
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${apiKey}&limit=${limit}&offset=${offset}&format=json`,
  );
  if (!res.ok) throw new Error(`Lead dataset fetch failed: ${res.statusText}`);
  return res.json();
}

// Preview: synchronous run returning 5 results for the wizard
export async function previewLeads(
  apiKey: string,
  input:  ApifyLeadScraperInput,
): Promise<ApifyLeadRecord[]> {
  const previewInput = { ...input, totalResults: 5 };
  const res = await fetch(
    `${APIFY_BASE}/acts/${LEAD_SCRAPER_ACTOR}/run-sync-get-dataset-items?token=${apiKey}`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(previewInput),
    },
  );
  if (!res.ok) throw new Error(`Lead preview failed: ${res.statusText}`);
  return res.json();
}

export function mapApifyRecord(
  r:             ApifyLeadRecord,
  workspaceId:   string,
  campaignId:    string,
  verifyEnabled: boolean,
): Record<string, unknown> {
  const location = [r.personCity, r.personCountry].filter(Boolean).join(", ") || null;
  const industry = Array.isArray(r.companyIndustry)
    ? (r.companyIndustry[0] ?? null)
    : (r.companyIndustry as string | null | undefined) ?? null;
  const department = Array.isArray(r.functions)
    ? (r.functions[0] ?? null)
    : (r.functional ?? null);
  const website = r.companyDomain
    ? (r.companyDomain.startsWith("http") ? r.companyDomain : `https://${r.companyDomain}`)
    : null;

  return {
    workspace_id:        workspaceId,
    campaign_id:         campaignId,
    email:               String(r.email ?? "").toLowerCase().trim(),
    first_name:          r.firstName ?? r.fullName?.split(" ")[0] ?? null,
    last_name:           r.lastName  ?? (r.fullName?.split(" ").slice(1).join(" ") || null),
    company:             r.companyName ?? null,
    title:               r.title || r.position || null,
    website,
    linkedin_url:        r.linkedinUrl ?? null,
    phone:               r.phone || null,
    location,
    industry,
    department,
    seniority:           r.seniority   ?? null,
    org_city:            r.companyCity    ?? null,
    org_state:           r.companyState   ?? null,
    org_country:         r.companyCountry ?? null,
    org_size:            r.companySize != null ? String(r.companySize) : null,
    org_linkedin_url:    r.companyLinkedinUrl ?? null,
    org_description:     r.companyDescription ?? null,
    org_founded_year:    r.foundedYear != null ? String(r.foundedYear) : null,
    raw_data:            r,
    verification_status: verifyEnabled ? "pending" : null,
  };
}
