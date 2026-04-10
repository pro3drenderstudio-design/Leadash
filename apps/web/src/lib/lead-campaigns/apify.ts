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
  firstName?:     string;   // Prospect's First Name
  lastName?:      string;   // Prospect's Last Name
  fullName?:      string;   // Prospect's Full Name
  position?:      string;   // Job Title
  seniority?:     string;   // Seniority Level
  functional?:    string;   // Department
  linkedinUrl?:   string;   // Prospect's LinkedIn
  email?:         string;   // Prospect's Work Email
  phone?:         string;   // Phone Number
  city?:          string;   // Prospect's City
  country?:       string;   // Prospect's Country
  // Company (org)
  orgName?:       string;   // Company Name
  orgIndustry?:   string;   // Company Industry
  orgWebsite?:    string;   // Company Website
  orgLinkedinUrl?: string;  // Company LinkedIn
  orgCity?:       string;   // Company City
  orgState?:      string;   // Company State
  orgCountry?:    string;   // Company Country
  orgSize?:       string;   // Company Size (employee count)
  orgDescription?: string;  // Company Description
  orgFoundedYear?: string;  // Company Founded Year
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
    throw new Error(`Apify run start failed: ${(err as { error?: { message?: string } })?.error?.message ?? res.statusText}`);
  }
  const { data } = await res.json();
  return data.id as string;
}

export async function getApifyRunStatus(
  apiKey: string,
  runId:  string,
): Promise<ApifyRunStatus> {
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apiKey}`);
  if (!res.ok) throw new Error(`Apify status check failed: ${res.statusText}`);
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
  if (!res.ok) throw new Error(`Apify dataset fetch failed: ${res.statusText}`);
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
  if (!res.ok) throw new Error(`Apify preview failed: ${res.statusText}`);
  return res.json();
}

export function mapApifyRecord(
  r:             ApifyLeadRecord,
  workspaceId:   string,
  campaignId:    string,
  verifyEnabled: boolean,
): Record<string, unknown> {
  const location = [r.city, r.country].filter(Boolean).join(", ") || null;

  return {
    workspace_id:        workspaceId,
    campaign_id:         campaignId,
    email:               String(r.email ?? "").toLowerCase().trim(),
    first_name:          r.firstName ?? r.fullName?.split(" ")[0] ?? null,
    last_name:           r.lastName  ?? r.fullName?.split(" ").slice(1).join(" ") || null,
    company:             r.orgName   ?? null,
    title:               r.position  ?? null,
    website:             r.orgWebsite ?? null,
    linkedin_url:        r.linkedinUrl ?? null,
    phone:               r.phone     ?? null,
    location,
    industry:            r.orgIndustry ?? null,
    // New fields
    department:          r.functional  ?? null,
    seniority:           r.seniority   ?? null,
    org_city:            r.orgCity     ?? null,
    org_state:           r.orgState    ?? null,
    org_country:         r.orgCountry  ?? null,
    org_size:            r.orgSize     ?? null,
    org_linkedin_url:    r.orgLinkedinUrl ?? null,
    org_description:     r.orgDescription ?? null,
    org_founded_year:    r.orgFoundedYear ?? null,
    raw_data:            r,
    verification_status: verifyEnabled ? "pending" : null,
  };
}
