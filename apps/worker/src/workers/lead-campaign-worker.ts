// ─── Lead Campaign Worker ─────────────────────────────────────────────────────
// Self-contained: does NOT import from apps/web. Runs the full campaign
// pipeline (scrape → verify → personalize) in a single long-lived job.
// For a 50k-lead full-suite campaign: ~40 min verify + ~80 min personalize.

import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";

// ─── Tuning ───────────────────────────────────────────────────────────────────

const VERIFY_CONCURRENCY      = 20;   // parallel Reoon requests per batch
const VERIFY_BATCH            = 500;  // leads fetched per verification loop
const PERSONALIZE_CONCURRENCY = 20;   // parallel OpenAI requests per batch
const PERSONALIZE_BATCH       = 300;  // leads fetched per personalization loop
const INSERT_CHUNK            = 200;  // max rows per Supabase insert

const REOON_BASE  = "https://emailverifier.reoon.com/api/v1";
const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const APIFY_BASE  = "https://api.apify.com/v2";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeadCampaignJobData {
  campaign_id: string;
}

type Db = ReturnType<typeof getDb>;

interface Campaign {
  id:                    string;
  workspace_id:          string;
  mode:                  string;
  status:                string;
  max_leads:             number;
  apify_run_id:          string | null;
  total_scraped:         number | null;
  total_verified:        number | null;
  total_personalized:    number | null;
  verify_enabled:        boolean;
  personalize_enabled:   boolean;
  personalize_prompt:    string | null;
  personalize_valid_only: boolean;
  personalize_depth:     string | null;
  source_campaign_id:    string | null;
  source_list_id:        string | null;
  credits_used:          number;
}

interface VerifyResult   { email: string; status: string; score: number; }
interface PersonalizeLead {
  id:         string;
  first_name?: string | null;
  last_name?:  string | null;
  title?:      string | null;
  company?:    string | null;
  industry?:   string | null;
  website?:    string | null;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

function getDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ─── Reoon verification ───────────────────────────────────────────────────────

async function verifySingle(apiKey: string, email: string): Promise<VerifyResult> {
  try {
    const url = `${REOON_BASE}/verify?email=${encodeURIComponent(email)}&key=${apiKey}&mode=power`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { email, status: "unknown", score: 0 };
    const data = await res.json() as Record<string, unknown>;
    return {
      email:  (data.email  as string) ?? email,
      status: (data.status as string) ?? "unknown",
      score:  typeof data.overall_score === "number" ? data.overall_score : 0,
    };
  } catch {
    return { email, status: "unknown", score: 0 };
  }
}

async function verifyInParallel(apiKey: string, emails: string[]): Promise<VerifyResult[]> {
  const results: VerifyResult[] = [];
  for (let i = 0; i < emails.length; i += VERIFY_CONCURRENCY) {
    const chunk   = emails.slice(i, i + VERIFY_CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map(e => verifySingle(apiKey, e)));
    for (let j = 0; j < chunk.length; j++) {
      const s = settled[j];
      results.push(s.status === "fulfilled" ? s.value : { email: chunk[j], status: "unknown", score: 0 });
    }
  }
  return results;
}

// ─── OpenAI personalization ───────────────────────────────────────────────────

async function personalizeSingle(
  apiKey:        string,
  lead:          PersonalizeLead,
  productPrompt: string,
  depth:         string,
): Promise<string> {
  try {
    const name    = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "there";
    const context = [
      lead.title,
      lead.company  && `at ${lead.company}`,
      lead.industry && `(${lead.industry} industry)`,
    ].filter(Boolean).join(" ");

    const isDeep = depth === "deep";

    const systemPrompt = isDeep
      ? "You are an expert cold email copywriter. Write complete, highly personalized cold email bodies. Never use placeholders. Output only the email body — no subject line, no greeting, no sign-off."
      : "You are a cold email expert. Write single personalized icebreaker opening lines. Output only the line — no quotes, no greeting, nothing else.";

    const userPrompt = isDeep
      ? `Write a personalized cold email body for this prospect.\n\nProspect: ${name}${context ? `, ${context}` : ""}\nOffer: ${productPrompt}\n\nRules:\n- 3-4 short paragraphs, conversational tone, no fluff\n- Reference their specific role, company, or industry naturally\n- Clear value proposition and one soft CTA at the end\n- No subject line, no greeting like "Hi [name]", no sign-off\n- No generic openers like "I hope this finds you well"\n- Under 120 words`
      : `Write a personalized icebreaker opening line (1-2 sentences, max 30 words) for a cold email to ${name}${context ? `, ${context}` : ""}.\n\nThe email is about: ${productPrompt}\n\nRules:\n- Reference something specific about their role, company, or industry\n- Sound natural and human, not salesy\n- No generic openers like "I came across your profile"\n- Do NOT start with "Hi [name]" — just the icebreaker line`;

    const res = await fetch(OPENAI_BASE, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:       OPENAI_MODEL,
        messages:    [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
        max_tokens:  isDeep ? 400 : 120,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return "";
    const data    = await res.json() as Record<string, unknown>;
    const choices = data?.choices as Array<{ message?: { content?: string } }>;
    const text    = choices?.[0]?.message?.content ?? "";
    return text.trim().replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

// ─── Credit deduction ─────────────────────────────────────────────────────────

async function deductCredits(
  db:          Db,
  workspaceId: string,
  campaignId:  string,
  amount:      number,
  action:      string,
): Promise<void> {
  if (amount <= 0) return;

  const { data: ws } = await db
    .from("workspaces")
    .select("lead_credits_balance")
    .eq("id", workspaceId)
    .single();
  if (!ws) return;

  const balance = ws.lead_credits_balance as number;
  const deduct  = Math.min(amount, Math.max(0, balance));
  if (deduct === 0) return;

  await db.from("workspaces")
    .update({ lead_credits_balance: balance - deduct })
    .eq("id", workspaceId);

  const { data: camp } = await db.from("lead_campaigns")
    .select("credits_used")
    .eq("id", campaignId)
    .single();
  if (camp) {
    await db.from("lead_campaigns")
      .update({ credits_used: (camp.credits_used as number) + deduct })
      .eq("id", campaignId);
  }

  await db.from("lead_credit_transactions").insert({
    workspace_id:     workspaceId,
    amount:           -deduct,
    type:             "consume",
    description:      `${action} — ${amount} leads`,
    lead_campaign_id: campaignId,
  });
}

// ─── Apify helpers ────────────────────────────────────────────────────────────

function mapApifyRow(r: Record<string, unknown>, workspaceId: string, campaignId: string, verifyEnabled: boolean) {
  const firstName = (r.firstName as string) ?? null;
  const fullName  = r.fullName ? String(r.fullName) : null;
  return {
    workspace_id:        workspaceId,
    campaign_id:         campaignId,
    email:               String(r.email ?? "").toLowerCase().trim(),
    first_name:          firstName ?? (fullName ? fullName.split(" ")[0] : null),
    last_name:           (r.lastName  as string) ?? (fullName ? fullName.split(" ").slice(1).join(" ") || null : null),
    company:             (r.orgName   as string) ?? null,
    title:               (r.position  as string) ?? null,
    website:             (r.orgWebsite as string) ?? null,
    linkedin_url:        (r.linkedinUrl as string) ?? null,
    phone:               (r.phone     as string) ?? null,
    location:            [(r.city as string), (r.country as string)].filter(Boolean).join(", ") || null,
    industry:            (r.orgIndustry  as string) ?? null,
    department:          (r.functional   as string) ?? null,
    seniority:           (r.seniority    as string) ?? null,
    org_city:            (r.orgCity      as string) ?? null,
    org_state:           (r.orgState     as string) ?? null,
    org_country:         (r.orgCountry   as string) ?? null,
    org_size:            (r.orgSize      as string) ?? null,
    org_linkedin_url:    (r.orgLinkedinUrl as string) ?? null,
    org_description:     (r.orgDescription as string) ?? null,
    org_founded_year:    (r.orgFoundedYear as string) ?? null,
    raw_data:            r,
    verification_status: verifyEnabled ? "pending" : null,
  };
}

// ─── Discover upsert ──────────────────────────────────────────────────────────

const DISCOVER_CHUNK = 200;

async function saveToDiscover(db: ReturnType<typeof getDb>, rows: Record<string, unknown>[]) {
  try {
    // Upsert companies (keyed on domain)
    const companyMap = new Map<string, string>(); // domain → id
    const companies = rows
      .filter(r => r.orgWebsite || r.orgLinkedinUrl)
      .map(r => {
        const rawDomain = (r.orgWebsite as string ?? "").replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
        return {
          name:        (r.orgName as string) ?? null,
          domain:      rawDomain || null,
          industry:    (r.orgIndustry as string) ?? null,
          size_range:  (r.orgSize as string) ?? null,
          country:     (r.orgCountry as string) ?? null,
          state:       (r.orgState as string) ?? null,
          city:        (r.orgCity as string) ?? null,
          linkedin_url:(r.orgLinkedinUrl as string) ?? null,
          website:     (r.orgWebsite as string) ?? null,
          updated_at:  new Date().toISOString(),
        };
      })
      .filter(c => c.domain);

    const uniqueCompanies = [...new Map(companies.map(c => [c.domain, c])).values()];
    for (let i = 0; i < uniqueCompanies.length; i += DISCOVER_CHUNK) {
      const { data: saved } = await db
        .from("discover_companies")
        .upsert(uniqueCompanies.slice(i, i + DISCOVER_CHUNK), { onConflict: "domain", ignoreDuplicates: false })
        .select("id, domain");
      for (const s of saved ?? []) {
        if (s.domain) companyMap.set(s.domain, s.id);
      }
    }

    // Upsert people
    const people = rows
      .filter(r => r.email || r.linkedinUrl)
      .map(r => {
        const rawDomain = (r.orgWebsite as string ?? "").replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
        const companyId = companyMap.get(rawDomain) ?? null;
        const firstName = (r.firstName as string) ?? (r.fullName ? String(r.fullName).split(" ")[0] : null);
        const lastName  = (r.lastName as string) ?? (r.fullName ? String(r.fullName).split(" ").slice(1).join(" ") || null : null);
        return {
          company_id:  companyId,
          first_name:  firstName,
          last_name:   lastName,
          title:       (r.position as string) ?? null,
          seniority:   (r.seniority as string) ?? null,
          department:  (r.functional as string) ?? null,
          linkedin_url:(r.linkedinUrl as string) ?? null,
          email:       r.email ? String(r.email).toLowerCase().trim() : null,
          email_status:"unverified" as const,
          phone:       (r.phone as string) ?? null,
          country:     (r.country as string) ?? null,
          state:       (r.state as string) ?? null,
          city:        (r.city as string) ?? null,
          source:      "apify",
          updated_at:  new Date().toISOString(),
        };
      });

    for (let i = 0; i < people.length; i += DISCOVER_CHUNK) {
      await db
        .from("discover_people")
        .upsert(people.slice(i, i + DISCOVER_CHUNK), { onConflict: "email", ignoreDuplicates: true });
    }
  } catch (e) {
    // Non-fatal — discover population should never fail a campaign
    console.error("[discover] save failed:", e instanceof Error ? e.message : e);
  }
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processLeadCampaign(job: Job<LeadCampaignJobData>): Promise<void> {
  const { campaign_id } = job.data;
  const db = getDb();

  const { data: campaign, error } = await db
    .from("lead_campaigns")
    .select("*")
    .eq("id", campaign_id)
    .single();

  if (error || !campaign) {
    console.error(`[lead-campaign] ${campaign_id}: not found`);
    return;
  }

  const c = campaign as unknown as Campaign;
  if (c.status === "completed" || c.status === "cancelled") return;

  const apifyKey  = process.env.APIFY_API_KEY  ?? "";
  const reoonKey  = process.env.REOON_API_KEY  ?? "";
  const openaiKey = process.env.OPENAI_API_KEY ?? "";

  console.log(`[lead-campaign] ${campaign_id}: START mode=${c.mode} max_leads=${c.max_leads}`);

  try {
    // ── STEP 1: Apify scrape (scrape / full_suite) ──────────────────────────
    if (c.mode === "scrape" || c.mode === "full_suite") {
      // Wait up to 120s for the web API handler to record the run ID
      if (!c.apify_run_id) {
        for (let attempt = 0; attempt < 12; attempt++) {
          await sleep(10_000);
          const { data: fresh } = await db.from("lead_campaigns").select("apify_run_id").eq("id", campaign_id).single();
          if (fresh?.apify_run_id) { c.apify_run_id = fresh.apify_run_id as string; break; }
        }
        if (!c.apify_run_id) throw new Error("Apify run was not started within 120s of campaign creation");
      }

      // Leads not yet inserted → poll Apify then ingest
      if (!c.total_scraped) {
        console.log(`[lead-campaign] ${campaign_id}: Polling Apify run ${c.apify_run_id}...`);

        let apifyStatus = "RUNNING";
        let datasetId: string | null = null;

        while (apifyStatus === "RUNNING" || apifyStatus === "TIMING-OUT") {
          await sleep(15_000);
          const res = await fetch(`${APIFY_BASE}/actor-runs/${c.apify_run_id}?token=${apifyKey}`);
          const { data: run } = await res.json() as { data: Record<string, unknown> };
          apifyStatus = run.status as string;
          datasetId   = (run.defaultDatasetId as string) ?? null;
          await job.updateProgress({ stage: "scraping", apify_status: apifyStatus });
          console.log(`[lead-campaign] ${campaign_id}: Apify status=${apifyStatus}`);
        }

        if (apifyStatus !== "SUCCEEDED" || !datasetId) {
          throw new Error(`Apify run ended with status: ${apifyStatus}`);
        }

        // Fetch dataset pages and insert leads
        const PAGE_SIZE = 1000;
        let offset = 0;
        let totalInserted = 0;

        while (totalInserted < c.max_leads) {
          const remaining = c.max_leads - totalInserted;
          const limit     = Math.min(PAGE_SIZE, remaining);
          const dsRes     = await fetch(
            `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyKey}&limit=${limit}&offset=${offset}&format=json`,
          );
          const items = (await dsRes.json()) as Record<string, unknown>[];
          if (!items.length) break;

          const valid = items.filter(r => r.email && String(r.email).includes("@")).slice(0, remaining);
          if (valid.length) {
            const rows = valid.map(r => mapApifyRow(r, c.workspace_id, campaign_id, c.verify_enabled));
            for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
              const { error: ie } = await db.from("lead_campaign_leads").insert(rows.slice(i, i + INSERT_CHUNK));
              if (ie) { console.error(`[lead-campaign] ${campaign_id}: insert error`, ie.message); break; }
              totalInserted += rows.slice(i, i + INSERT_CHUNK).length;
            }
            saveToDiscover(db, valid).catch(() => {});
          }

          offset += items.length;
          if (items.length < limit) break;
        }

        if (totalInserted > 0) {
          await deductCredits(db, c.workspace_id, campaign_id, totalInserted, "scrape");
        }
        await db.from("lead_campaigns").update({ total_scraped: totalInserted }).eq("id", campaign_id);
        console.log(`[lead-campaign] ${campaign_id}: Inserted ${totalInserted} scraped leads`);

        if (totalInserted === 0) {
          await db.from("lead_campaigns").update({
            status: "completed", completed_at: now(), total_valid: 0,
          }).eq("id", campaign_id);
          return;
        }
      }
    }

    // ── STEP 1b: Copy leads for verify / verify_personalize if needed ────────
    if (
      (c.mode === "verify_personalize" || c.mode === "verify") &&
      (c.source_campaign_id || c.source_list_id)
    ) {
      const { count: leadCount } = await db
        .from("lead_campaign_leads")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaign_id);

      if ((leadCount ?? 0) === 0) {
        if (c.source_campaign_id) {
          const { data: src } = await db
            .from("lead_campaign_leads")
            .select("email, first_name, last_name, company, title, website, linkedin_url, phone, location, industry, department, seniority, org_city, org_state, org_country, org_size, org_linkedin_url, org_description, org_founded_year")
            .eq("campaign_id", c.source_campaign_id)
            .eq("workspace_id", c.workspace_id)
            .limit(c.max_leads);

          if (src?.length) {
            type SrcLead = Record<string, unknown>;
            await db.from("lead_campaign_leads").insert(
              (src as SrcLead[]).map(({ id: _id, created_at: _ca, ...l }) => ({
                ...l,
                workspace_id:        c.workspace_id,
                campaign_id,
                verification_status: c.verify_enabled ? "pending" : null,
                personalized_line:   null,
              })),
            );
            await db.from("lead_campaigns").update({ total_scraped: src.length }).eq("id", campaign_id);
          }
        } else if (c.source_list_id) {
          const { data: src } = await db
            .from("outreach_leads")
            .select("email, first_name, last_name, company, title, website")
            .eq("list_id", c.source_list_id)
            .eq("status", "active")
            .limit(c.max_leads);

          if (src?.length) {
            type SrcLead = { email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null; website: string | null };
            await db.from("lead_campaign_leads").insert(
              (src as SrcLead[]).map(l => ({
                workspace_id:        c.workspace_id,
                campaign_id,
                email:               l.email,
                first_name:          l.first_name,
                last_name:           l.last_name,
                company:             l.company,
                title:               l.title,
                website:             l.website,
                verification_status: c.verify_enabled ? "pending" : null,
              })),
            );
            await db.from("lead_campaigns").update({ total_scraped: src.length }).eq("id", campaign_id);
          }
        }
      }
    }

    // ── STEP 2: Email verification ────────────────────────────────────────────
    if (c.verify_enabled) {
      let verifiedTotal = c.total_verified ?? 0;
      console.log(`[lead-campaign] ${campaign_id}: Verifying emails (${reoonKey ? "Reoon configured" : "NO API KEY"})...`);

      while (true) {
        const { data: pending } = await db
          .from("lead_campaign_leads")
          .select("id, email")
          .eq("campaign_id", campaign_id)
          .eq("verification_status", "pending")
          .limit(VERIFY_BATCH);

        if (!pending?.length) break;

        type PendingLead = { id: string; email: string };
        const leads   = pending as PendingLead[];
        const results = await verifyInParallel(reoonKey, leads.map(l => l.email));

        for (const result of results) {
          const lead = leads.find(l => l.email === result.email);
          if (lead) {
            await db.from("lead_campaign_leads").update({
              verification_status: result.status,
              verification_score:  result.score,
            }).eq("id", lead.id);
          }
        }

        await deductCredits(db, c.workspace_id, campaign_id, results.length * 0.5, "verify");
        verifiedTotal += results.length;

        await db.from("lead_campaigns").update({ total_verified: verifiedTotal }).eq("id", campaign_id);
        await job.updateProgress({ stage: "verifying", verified: verifiedTotal });
        console.log(`[lead-campaign] ${campaign_id}: Verified ${verifiedTotal}...`);

        if (pending.length < VERIFY_BATCH) break;
      }

      console.log(`[lead-campaign] ${campaign_id}: Verification done (${verifiedTotal} leads)`);
    }

    // ── STEP 3: AI personalization ────────────────────────────────────────────
    // Re-fetch to get latest state (verify step may have run for a long time)
    const { data: freshCamp } = await db.from("lead_campaigns").select("*").eq("id", campaign_id).single();
    const c3 = (freshCamp ?? c) as unknown as Campaign;

    if (c3.personalize_enabled && c3.personalize_prompt) {
      let personalizedTotal = c3.total_personalized ?? 0;
      console.log(`[lead-campaign] ${campaign_id}: Personalizing (${openaiKey ? "OpenAI configured" : "NO API KEY"})...`);

      while (true) {
        const baseQuery = db
          .from("lead_campaign_leads")
          .select("id, first_name, last_name, title, company, industry, website")
          .eq("campaign_id", campaign_id)
          .is("personalized_line", null)
          .limit(PERSONALIZE_BATCH);

        const { data: unpersonalized } = c3.personalize_valid_only
          ? await baseQuery.in("verification_status", ["safe", "valid", "catch_all"])
          : await baseQuery;

        if (!unpersonalized?.length) break;

        const rows  = unpersonalized as PersonalizeLead[];
        const lines = new Array<string>(rows.length).fill("");

        // Fan out with PERSONALIZE_CONCURRENCY parallel requests
        for (let i = 0; i < rows.length; i += PERSONALIZE_CONCURRENCY) {
          const chunk   = rows.slice(i, i + PERSONALIZE_CONCURRENCY);
          const settled = await Promise.allSettled(
            chunk.map(lead => personalizeSingle(openaiKey, lead, c3.personalize_prompt!, c3.personalize_depth ?? "standard")),
          );
          for (let j = 0; j < chunk.length; j++) {
            const s = settled[j];
            lines[i + j] = s.status === "fulfilled" ? s.value : "";
          }
        }

        let personalized = 0;
        for (let i = 0; i < rows.length; i++) {
          if (lines[i]) {
            await db.from("lead_campaign_leads")
              .update({ personalized_line: lines[i] })
              .eq("id", rows[i].id);
            personalized++;
          }
        }

        // Safety: if zero succeeded this batch, stop to avoid infinite loop
        if (personalized === 0) {
          console.warn(`[lead-campaign] ${campaign_id}: All personalization calls failed, stopping`);
          break;
        }

        await deductCredits(db, c3.workspace_id, campaign_id, personalized * 0.5, "personalize");
        personalizedTotal += personalized;
        await db.from("lead_campaigns").update({ total_personalized: personalizedTotal }).eq("id", campaign_id);
        await job.updateProgress({ stage: "personalizing", personalized: personalizedTotal });
        console.log(`[lead-campaign] ${campaign_id}: Personalized ${personalizedTotal}...`);

        if (unpersonalized.length < PERSONALIZE_BATCH) break;
      }

      console.log(`[lead-campaign] ${campaign_id}: Personalization done (${personalizedTotal} leads)`);
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    const { count: totalValid } = await db
      .from("lead_campaign_leads")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .in("verification_status", ["safe", "valid", "catch_all"]);

    await db.from("lead_campaigns").update({
      status:       "completed",
      completed_at: now(),
      total_valid:  totalValid ?? 0,
    }).eq("id", campaign_id);

    console.log(`[lead-campaign] ${campaign_id}: COMPLETED ✓ total_valid=${totalValid}`);

  } catch (err) {
    console.error(`[lead-campaign] ${campaign_id}: FAILED`, err);
    await db.from("lead_campaigns").update({
      status:        "failed",
      error_message: err instanceof Error ? err.message : String(err),
      completed_at:  now(),
    }).eq("id", campaign_id);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function now()             { return new Date().toISOString(); }
