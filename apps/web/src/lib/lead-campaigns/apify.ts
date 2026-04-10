// ─── Apify REST API v2 — pipelinelabs lead scraper ───────────────────────────

import type { ApifyLeadScraperInput } from "@/types/lead-campaigns";

const APIFY_BASE  = "https://api.apify.com/v2";
export const LEAD_SCRAPER_ACTOR = "pipelinelabs~lead-scraper-apollo-zoominfo-lusha-ppe";

export interface ApifyRunStatus {
  status:    "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMING-OUT" | "TIMED-OUT";
  datasetId: string | null;
}

// All possible field names the actor may return (Apollo-style snake_case + camelCase fallbacks)
export interface ApifyLeadRecord {
  // Name — actor returns full_name or first_name/last_name
  full_name?:                   string;
  first_name?:                  string;
  last_name?:                   string;
  firstName?:                   string;  // camelCase fallback
  lastName?:                    string;
  name?:                        string;
  // Title
  person_title?:                string;
  title?:                       string;
  headline?:                    string;
  // Company
  organization_name?:           string;
  company_name?:                string;
  company?:                     string;
  // Industry
  organization_industry?:       string;
  industry?:                    string;
  // Website
  organization_website_url?:    string;
  website_url?:                 string;
  website?:                     string;
  // LinkedIn
  person_linkedin_url?:         string;
  linkedin_url?:                string;
  linkedinUrl?:                 string;
  // Company LinkedIn
  organization_linkedin_url?:   string;
  company_linkedin_url?:        string;
  // Contact
  email?:                       string;
  phone?:                       string;
  sanitized_phone?:             string;
  // Location
  city?:                        string;
  state?:                       string;
  country?:                     string;
  location?:                    string;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function resolveField<T>(record: ApifyLeadRecord, ...keys: (keyof ApifyLeadRecord)[]): T | null {
  for (const k of keys) {
    const v = record[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return null;
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
  record:        ApifyLeadRecord,
  workspaceId:   string,
  campaignId:    string,
  verifyEnabled: boolean,
): Record<string, unknown> {
  const firstName = resolveField<string>(record, "first_name", "firstName")
    ?? resolveField<string>(record, "full_name", "name")?.split(" ")[0]
    ?? null;
  const lastName  = resolveField<string>(record, "last_name", "lastName")
    ?? (resolveField<string>(record, "full_name", "name")?.split(" ").slice(1).join(" ") || null);

  const location = resolveField<string>(record, "location", "city", "state", "country") ?? null;

  return {
    workspace_id:        workspaceId,
    campaign_id:         campaignId,
    email:               String(record.email ?? "").toLowerCase().trim(),
    first_name:          firstName,
    last_name:           lastName,
    company:             resolveField(record, "organization_name", "company_name", "company"),
    title:               resolveField(record, "person_title", "title", "headline"),
    website:             resolveField(record, "organization_website_url", "website_url", "website"),
    linkedin_url:        resolveField(record, "person_linkedin_url", "linkedin_url", "linkedinUrl"),
    phone:               resolveField(record, "phone", "sanitized_phone"),
    location,
    industry:            resolveField(record, "organization_industry", "industry"),
    raw_data:            record,
    verification_status: verifyEnabled ? "pending" : null,
  };
}
