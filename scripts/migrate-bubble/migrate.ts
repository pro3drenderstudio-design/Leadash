/**
 * Bubble.io → Supabase Migration Script
 *
 * Usage:
 *   1. Export each data type from Bubble: App Data > [Type] > Download as CSV
 *   2. Place the files in ./exports/ with these exact names:
 *        User.csv, LeadCampaign.csv, LeadRecord.csv,
 *        CreditTransactions.csv, SupportMessage.csv
 *   3. Install deps:  npm install
 *   4. Run:          npm run migrate
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Resolve the script's own directory robustly across CJS and ESM/tsx modes
function resolveScriptDir(): string {
  // tsx in some configurations sets __dirname; fall back to process.cwd()
  try {
    if (typeof __dirname === 'string' && __dirname) return __dirname;
  } catch {}
  return process.cwd();
}
const SCRIPT_DIR = resolveScriptDir();

// Load env from the web app
const envPath = path.resolve(SCRIPT_DIR, '../../apps/web/.env');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Prefer cwd-relative exports (works when running via `npm run migrate` from this dir),
// fall back to script-dir-relative exports.
const EXPORTS_DIR = (() => {
  const cwdBased = path.resolve(process.cwd(), 'exports');
  if (fs.existsSync(cwdBased)) return cwdBased;
  return path.resolve(SCRIPT_DIR, 'exports');
})();

// ─── Bubble slug → Supabase UUID maps ────────────────────────────────────────
const userMap = new Map<string, string>();       // bubbleId → auth user UUID
const workspaceMap = new Map<string, string>();  // bubbleId → workspace UUID
const campaignMap = new Map<string, string>();   // bubbleId → lead_campaign UUID

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readCsv(filename: string): Record<string, string>[] {
  const filePath = path.join(EXPORTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  ${filename} not found in exports/ — skipping this type`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

/**
 * Return the first non-empty, non-"0" value for any of the given key variants.
 * Bubble exports empty/null fields as the string "0", so we treat "0" as empty.
 */
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v && v !== '0') return v;
  }
  return '';
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 44);
  const rand = Math.random().toString(36).substring(2, 7);
  return `${base}-${rand}`;
}

function bubbleId(row: Record<string, string>): string {
  // Try all known Bubble ID column name variants
  const explicit = pick(row, '_id', 'Unique ID', 'unique_id', 'id', 'ID', 'Bubble ID', 'bubble_id');
  if (explicit) return explicit;
  // Last resort: use the very first column's value (Bubble puts the ID first)
  const firstVal = Object.values(row)[0]?.trim();
  return firstVal || '';
}

// ─── 1. Users ─────────────────────────────────────────────────────────────────

async function migrateUsers() {
  console.log('\n👤 Migrating Users…');
  const rows = readCsv('User.csv');
  if (!rows.length) return;

  for (const row of rows) {
    const id = bubbleId(row);
    const email = pick(row, 'Email', 'email');
    const firstName = pick(row, 'First Name', 'First_name', 'first_name');
    const lastName = pick(row, 'Last Name', 'Last_name', 'last_name');
    const name = pick(row, 'Name', 'name') || `${firstName} ${lastName}`.trim() || email.split('@')[0];
    const credits = parseInt(pick(row, 'Credits_remaining', 'credits_remaining') || '0', 10) || 0;

    if (!email) { console.warn(`  ⚠️  Skipping user with no email (id=${id})`); continue; }

    console.log(`  → ${email}`);

    // Create or find the auth user
    let userId: string | undefined;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, full_name: name },
    });

    if (createErr) {
      if (createErr.message.includes('already been registered') || createErr.message.includes('already exists')) {
        // Look up existing user by email
        const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        userId = users.find(u => u.email === email)?.id;
      } else {
        console.error(`    ❌ Auth error: ${createErr.message}`);
        continue;
      }
    } else {
      userId = created.user?.id;
    }

    if (!userId) { console.error(`    ❌ Could not resolve user ID for ${email}`); continue; }

    userMap.set(id, userId);

    // Check if a workspace already exists for this owner
    const { data: existing } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', userId)
      .maybeSingle();

    if (existing) {
      workspaceMap.set(id, existing.id);
      console.log(`    ✓ Using existing workspace`);
      continue;
    }

    // Create workspace
    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({
        name,
        slug: slugify(name),
        owner_id: userId,
        plan_id: 'free',
        lead_credits_balance: credits,
        onboarding_done: true,
      })
      .select('id')
      .single();

    if (wsErr) { console.error(`    ❌ Workspace error: ${wsErr.message}`); continue; }

    workspaceMap.set(id, ws.id);

    // Add workspace member (owner role)
    await supabase.from('workspace_members').insert({
      workspace_id: ws.id,
      user_id: userId,
      role: 'owner',
    });

    // Default workspace settings
    await supabase.from('workspace_settings').insert({ workspace_id: ws.id });

    console.log(`    ✓ Workspace created: ${name}`);
  }

  console.log(`  ✅ ${userMap.size} users processed`);
}

// ─── 2. Lead Campaigns ────────────────────────────────────────────────────────

function mapCampaignStatus(s: string): string {
  const m: Record<string, string> = {
    completed: 'completed', complete: 'completed',
    running: 'running', active: 'running', in_progress: 'running',
    pending: 'pending',
    failed: 'failed',
    cancelled: 'cancelled', canceled: 'cancelled',
  };
  return m[s.toLowerCase()] ?? 'completed';
}

async function migrateLeadCampaigns() {
  console.log('\n📋 Migrating Lead Campaigns…');
  const rows = readCsv('LeadCampaign.csv');
  if (!rows.length) return;

  for (const row of rows) {
    const id = bubbleId(row);
    const userBubbleId = pick(row, 'User', 'user');
    const workspaceId = workspaceMap.get(userBubbleId);

    if (!workspaceId) {
      console.warn(`  ⚠️  Campaign ${id}: no workspace for user "${userBubbleId}" — skipping`);
      continue;
    }

    // Pack all filter/config fields into apify_input JSONB
    const apifyInput: Record<string, string> = {};
    const filterKeys = [
      'AI_depth', 'AI_tone', 'Offer_angle', 'Additional_titles', 'Similar_titles',
      'Job_titles_included', 'Job_titles_excluded',
      'Keywords_included', 'Keywords_excluded',
      'Industries_included', 'Industries_excluded',
      'Company_size', 'Funding', 'Minimum_revenue', 'Maximum_revenue',
      'Countries_company_included', 'Countries_company_excluded',
      'Cities_company_included', 'Cities_company_excluded',
      'Countries_personnel_included', 'Countries_personnel_excluded',
      'Cities_personnel_included', 'Cities_personnel_excluded',
      'Company_name_included', 'Company_name_excluded', 'Company_name_max',
      'Company_website_domain', 'Company_website_exclude', 'Company_website_include',
      'Company_keywords_included', 'Company_keywords_excluded',
      'Seniority_level_included', 'Seniority_level_excluded',
      'Functional_level_included', 'Functional_level_excluded',
    ];
    for (const k of filterKeys) {
      const v = pick(row, k, k.toLowerCase());
      if (v) apifyInput[k.toLowerCase()] = v;
    }

    const { data, error } = await supabase
      .from('lead_campaigns')
      .insert({
        workspace_id: workspaceId,
        name: pick(row, 'Campaign_name', 'campaign_name', 'Name', 'name') || 'Imported Campaign',
        mode: 'scrape',
        status: mapCampaignStatus(pick(row, 'Status', 'status')),
        apify_run_id: pick(row, 'Apify_run_id', 'apify_run_id') || null,
        apify_input: Object.keys(apifyInput).length ? apifyInput : null,
        max_leads: parseInt(pick(row, 'Lead_quantity', 'lead_quantity') || '100', 10) || 100,
        total_scraped: parseInt(pick(row, 'Leads_processed', 'leads_processed') || '0', 10) || 0,
        total_valid: parseInt(pick(row, 'Leads_processed', 'leads_processed') || '0', 10) || 0,
        credits_used: parseInt(pick(row, 'Credits_spent', 'credits_spent') || '0', 10) || 0,
        created_at: parseDate(pick(row, 'Created Date', 'created_date')) ?? new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  ❌ Campaign ${id}: ${error.message}`);
    } else {
      campaignMap.set(id, data.id);
      console.log(`  ✓ ${pick(row, 'Campaign_name', 'Name') || id}`);
    }
  }

  console.log(`  ✅ ${campaignMap.size} campaigns migrated`);
}

// ─── 3. Lead Records ──────────────────────────────────────────────────────────

function mapVerificationStatus(s: string): string | null {
  const m: Record<string, string> = {
    valid: 'valid', invalid: 'invalid',
    catch_all: 'catch_all', catchall: 'catch_all',
    disposable: 'disposable', unknown: 'unknown', pending: 'pending',
  };
  return m[s.toLowerCase()] ?? null;
}

async function migrateLeadRecords() {
  console.log('\n👥 Migrating Lead Records…');
  const rows = readCsv('LeadRecord.csv');
  if (!rows.length) return;

  let migrated = 0;
  const BATCH = 100;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const inserts = [];

    for (const row of batch) {
      const userBubbleId = pick(row, 'User', 'user');
      const campaignBubbleId = pick(row, 'Campaign', 'campaign');
      const workspaceId = workspaceMap.get(userBubbleId);
      const campaignId = campaignMap.get(campaignBubbleId);

      if (!workspaceId || !campaignId) continue;

      const email = pick(row, 'Email_address', 'email_address', 'Email', 'email');
      if (!email) continue;

      // Fields that don't have a dedicated column go into raw_data
      const rawData: Record<string, string> = {};
      const overflow = [
        ['city', 'City', 'city'],
        ['state', 'State', 'state'],
        ['campaign_type', 'Campaign_Type', 'Campaign Type', 'campaign_type'],
        ['company_domain', 'Company_domain', 'company_domain'],
        ['company_full_address', 'Company_full_address', 'company_full_address'],
        ['company_postal_code', 'Company_postal_code', 'company_postal_code'],
        ['company_street_address', 'Company_street_address', 'Company_street_ad', 'company_street_address'],
        ['company_technologies', 'Company_technologies', 'Company_technologi', 'company_technologies'],
        ['company_total_funding', 'Company_total_funding', 'Company_total_fund', 'company_total_funding'],
        ['company_annual_revenue_min', 'Company_annual_revenue_min', 'company_annual_re'],
        ['keywords', 'Keywords', 'keywords'],
      ] as [string, ...string[]][];

      for (const [key, ...variants] of overflow) {
        const v = pick(row, ...variants);
        if (v) rawData[key] = v;
      }

      inserts.push({
        workspace_id: workspaceId,
        campaign_id: campaignId,
        email,
        first_name: pick(row, 'First_name', 'first_name', 'First Name') || null,
        last_name: pick(row, 'Last_name', 'last_name', 'Last Name') || null,
        company: pick(row, 'Company_name', 'company_name', 'Company') || null,
        title: pick(row, 'Job_title', 'job_title') || null,
        website: pick(row, 'Company_website', 'company_website') || null,
        linkedin_url: pick(row, 'Linkedin', 'linkedin', 'LinkedIn') || null,
        phone: pick(row, 'Phone', 'phone') || null,
        location: pick(row, 'Country', 'country') || null,
        industry: pick(row, 'Industry', 'industry') || null,
        verification_status: mapVerificationStatus(pick(row, 'Verification_status', 'verification_status')),
        personalized_line: pick(row, 'Ai_first_line', 'ai_first_line') || null,
        department: pick(row, 'Functional_level', 'functional_level') || null,
        seniority: pick(row, 'Seniority_level', 'seniority_level') || null,
        org_city: pick(row, 'Company_city', 'company_city') || null,
        org_state: pick(row, 'Company_state', 'company_state') || null,
        org_country: pick(row, 'Company_country', 'company_country') || null,
        org_description: pick(row, 'Company_description', 'company_description') || null,
        org_founded_year: pick(row, 'Company_founded_year', 'Company_founded', 'company_founded') || null,
        org_size: pick(row, 'Company_size', 'company_size') || null,
        org_linkedin_url: pick(row, 'Company_linkedin', 'company_linkedin') || null,
        raw_data: Object.keys(rawData).length ? rawData : null,
        created_at: parseDate(pick(row, 'Created Date', 'created_date')) ?? new Date().toISOString(),
      });
    }

    if (!inserts.length) continue;

    const { error } = await supabase.from('lead_campaign_leads').insert(inserts);
    if (error) {
      console.error(`  ❌ Batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
    } else {
      migrated += inserts.length;
      console.log(`  ✓ Batch ${Math.floor(i / BATCH) + 1}: ${inserts.length} leads`);
    }
  }

  console.log(`  ✅ ${migrated} lead records migrated`);
}

// ─── 4. Credit Transactions ───────────────────────────────────────────────────

function mapTxType(s: string): string {
  const m: Record<string, string> = {
    grant: 'grant', purchase: 'purchase', reserve: 'reserve',
    consume: 'consume', refund: 'refund',
    credit: 'grant', debit: 'consume', buy: 'purchase',
  };
  return m[s.toLowerCase()] ?? 'grant';
}

async function migrateCreditTransactions() {
  console.log('\n💳 Migrating Credit Transactions…');
  const rows = readCsv('CreditTransactions.csv');
  if (!rows.length) return;

  let migrated = 0;

  for (const row of rows) {
    const userBubbleId = pick(row, 'User', 'user');
    const campaignBubbleId = pick(row, 'Campaign', 'campaign');
    const workspaceId = workspaceMap.get(userBubbleId);

    if (!workspaceId) continue;

    const amount = parseInt(pick(row, 'Credits', 'credits', 'Amount_paid', 'amount_paid') || '0', 10) || 0;

    const { error } = await supabase.from('lead_credit_transactions').insert({
      workspace_id: workspaceId,
      amount,
      type: mapTxType(pick(row, 'Transaction_Type', 'Transaction Type', 'transaction_type')),
      description: pick(row, 'Description', 'description') || null,
      lead_campaign_id: campaignMap.get(campaignBubbleId) || null,
      created_at: parseDate(pick(row, 'Created Date', 'created_date')) ?? new Date().toISOString(),
    });

    if (error) {
      console.error(`  ❌ ${error.message}`);
    } else {
      migrated++;
    }
  }

  console.log(`  ✅ ${migrated} transactions migrated`);
}

// ─── 5. Support Messages ──────────────────────────────────────────────────────

async function migrateSupportMessages() {
  console.log('\n🎫 Migrating Support Messages…');
  const rows = readCsv('SupportMessage.csv');
  if (!rows.length) return;

  let migrated = 0;

  for (const row of rows) {
    const userBubbleId = pick(row, 'User', 'user');
    const workspaceId = workspaceMap.get(userBubbleId);
    const userId = userMap.get(userBubbleId);

    if (!workspaceId || !userId) continue;

    const { error } = await supabase.from('support_tickets').insert({
      workspace_id: workspaceId,
      user_id: userId,
      subject: pick(row, 'Subject', 'subject') || '(no subject)',
      message: pick(row, 'Message', 'message') || '',
      category: 'general',
      priority: 'medium',
      status: 'open',
      created_at: parseDate(pick(row, 'Created Date', 'created_date')) ?? new Date().toISOString(),
    });

    if (error) {
      console.error(`  ❌ ${error.message}`);
    } else {
      migrated++;
    }
  }

  console.log(`  ✅ ${migrated} support messages migrated`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Bubble.io → Supabase Migration');
  console.log(`   Project:    ${SUPABASE_URL}`);
  console.log(`   Script dir: ${SCRIPT_DIR}`);
  console.log(`   CWD:        ${process.cwd()}`);
  console.log(`   Exports:    ${EXPORTS_DIR}\n`);

  if (!fs.existsSync(EXPORTS_DIR)) {
    console.error(`exports/ directory not found at ${EXPORTS_DIR}`);
    console.error('Create it and place your Bubble CSV exports inside.');
    process.exit(1);
  }

  // List every file Node.js actually sees in the exports directory
  const found = fs.readdirSync(EXPORTS_DIR);
  console.log(`   Files in exports/: ${found.length ? found.join(', ') : '(empty)'}`);

  // Print column headers for each CSV so we can verify field mappings
  for (const f of found.filter(f => f.endsWith('.csv'))) {
    const rows = readCsv(f);
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      console.log(`   ${f} columns: ${cols.slice(0, 8).join(' | ')}${cols.length > 8 ? ' …' : ''}`);
    }
  }
  console.log();

  await migrateUsers();
  await migrateLeadCampaigns();
  await migrateLeadRecords();
  await migrateCreditTransactions();
  await migrateSupportMessages();

  console.log('\n─────────────────────────────────────────');
  console.log('✅ Migration complete!');
  console.log(`   Users:        ${userMap.size}`);
  console.log(`   Workspaces:   ${workspaceMap.size}`);
  console.log(`   Campaigns:    ${campaignMap.size}`);
  console.log('\nReminder: send a password-reset email to all migrated users');
  console.log('so they can set their own password and log in.');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
