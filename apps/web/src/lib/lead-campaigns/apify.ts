// ─── Apify REST API v2 — pipelinelabs lead scraper ───────────────────────────

import type { ApifyLeadScraperInput } from "@/types/lead-campaigns";

const APIFY_BASE  = "https://api.apify.com/v2";
export const LEAD_SCRAPER_ACTOR = "pipelinelabs~lead-scraper-apollo-zoominfo-lusha-ppe";

export interface ApifyRunStatus {
  status:    "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMING-OUT" | "TIMED-OUT";
  datasetId: string | null;
}

export interface ApifyLeadRecord {
  email?:       string;
  firstName?:   string;
  lastName?:    string;
  name?:        string;
  title?:       string;
  company?:     string;
  industry?:    string;
  website?:     string;
  linkedinUrl?: string;
  phone?:       string;
  location?:    string;
  city?:        string;
  country?:     string;
  [key: string]: unknown;
}

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

// Preview: run synchronously and return first 5 results for the wizard preview step
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
  record:      ApifyLeadRecord,
  workspaceId: string,
  campaignId:  string,
  verifyEnabled: boolean,
): Record<string, unknown> {
  const nameParts = (record.name ?? "").split(" ");
  return {
    workspace_id:        workspaceId,
    campaign_id:         campaignId,
    email:               String(record.email ?? "").toLowerCase().trim(),
    first_name:          record.firstName ?? nameParts[0] ?? null,
    last_name:           record.lastName  ?? (nameParts.slice(1).join(" ") || null),
    company:             record.company   ?? null,
    title:               record.title     ?? null,
    website:             record.website   ?? null,
    linkedin_url:        record.linkedinUrl ?? null,
    phone:               record.phone     ?? null,
    location:            record.location  ?? record.city ?? record.country ?? null,
    industry:            record.industry  ?? null,
    raw_data:            record,
    verification_status: verifyEnabled ? "pending" : null,
  };
}
