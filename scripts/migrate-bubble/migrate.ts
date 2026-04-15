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

/** Returns the Bubble unique id for a row (the "unique id" column). */
function bubbleId(row: Record<string, string>): string {
  // Bubble exports the primary key as "unique id" (lowercase, with space)
  const v = row['unique id']?.trim();
  if (v && v !== '0') return v;
  // Fallbacks for other export formats
  const explicit = pick(row, 'Slug', 'slug', '_id', 'Unique ID', 'unique_id', 'id', 'ID');
  return explicit;
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

    // Key maps by EMAIL — all other CSVs reference users by email
    userMap.set(email, userId);

    // Check if a workspace already exists for this owner
    const { data: existing } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', userId)
      .maybeSingle();

    if (existing) {
      workspaceMap.set(email, existing.id);
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

    workspaceMap.set(email, ws.id);

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
    // Column names come directly from the CSV (actual Bubble export names)
    const apifyInput: Record<string, string> = {};
    const filterKeys = [
      'AI Depth', 'AI Tone', 'offer_angle', 'additional_titles', 'similar_titles',
      'job_titles_included', 'job_titles_excluded',
      'keywords_included', 'keywords_excluded',
      'industries_included', 'industries_excluded',
      'company_size', 'funding', 'minimum_revenue', 'maximum_revenue',
      'countries_company_include', 'countries_company_exclude',
      'cities_company_include', 'cities_company_exclude',
      'countries_personnel_include', 'countries_personnel_exclude',
      'cities_personnel_include', 'cities_personnel_exclude',
      'company_name_include', 'company_name_exclude', 'company_name_match',
      'company_website_domain_match_mode', 'company_website_exclude', 'company_website_include',
      'Company_keywords_included', 'Company_keywords_excluded',
      'seniority_level_included', 'seniority_level_excluded',
      'functional_level_include', 'functional_level_excluded',
    ];
    for (const k of filterKeys) {
      const v = row[k]?.trim();
      if (v && v !== '0') apifyInput[k] = v;
    }

    const leadsProcessed = parseInt(row['Leads Processed'] || '0', 10) || 0;

    const { data, error } = await supabase
      .from('lead_campaigns')
      .insert({
        workspace_id: workspaceId,
        name: pick(row, 'campaign_name', 'Campaign_name', 'name') || 'Imported Campaign',
        mode: 'scrape',
        status: mapCampaignStatus(pick(row, 'status', 'Status')),
        apify_run_id: pick(row, 'apify_run_id', 'Apify_run_id') || null,
        apify_input: Object.keys(apifyInput).length ? apifyInput : null,
        max_leads: parseInt(row['lead_quantity'] || '100', 10) || 100,
        total_scraped: leadsProcessed,
        total_valid: leadsProcessed,
        credits_used: parseInt(row['credits_spent'] || '0', 10) || 0,
        created_at: parseDate(pick(row, 'Creation Date', 'Created Date')) ?? new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  ❌ Campaign ${id}: ${error.message}`);
    } else {
      campaignMap.set(id, data.id);
      console.log(`  ✓ ${row['campaign_name'] || id}`);
    }
  }

  console.log(`  ✅ ${campaignMap.size} campaigns migrated`);
}

// ─── 3. Lead Records ──────────────────────────────────────────────────────────

function mapVerificationStatus(s: string): string | null {
  const lower = s.toLowerCase().trim();
  if (lower.startsWith('valid')) return 'valid';   // covers "valid", "valid & personalized", etc.
  if (lower.startsWith('invalid')) return 'invalid';
  if (lower === 'catch_all' || lower === 'catchall') return 'catch_all';
  if (lower === 'disposable') return 'disposable';
  if (lower === 'unknown') return 'unknown';
  if (lower === 'pending') return 'pending';
  return null;
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
      // User FK = email; Campaign FK = campaign's unique id
      const userEmail = pick(row, 'user', 'User');
      const campaignBubbleId = row['campaign']?.trim() || row['Campaign']?.trim() || '';
      const workspaceId = workspaceMap.get(userEmail);
      const campaignId = campaignMap.get(campaignBubbleId);

      if (!workspaceId || !campaignId) continue;

      const email = pick(row, 'email_address', 'Email_address', 'email', 'Email');
      if (!email) continue;

      // Fields without dedicated columns → raw_data
      const rawData: Record<string, string> = {};
      const overflowKeys = [
        'city', 'state', 'Campaign_Type', 'company_domain', 'company_full_address',
        'company_postal_code', 'company_street_address', 'company_technologies',
        'company_total_funding', 'company_annual_revenue', 'company_annual_revenue_clean',
        'keywords',
      ];
      for (const k of overflowKeys) {
        const v = row[k]?.trim();
        if (v && v !== '0') rawData[k] = v;
      }

      inserts.push({
        workspace_id: workspaceId,
        campaign_id: campaignId,
        email,
        first_name: pick(row, 'first_name', 'First_name', 'First Name') || null,
        last_name: pick(row, 'last_name', 'Last_name', 'Last Name') || null,
        company: pick(row, 'company_name', 'Company_name', 'Company') || null,
        title: pick(row, 'job_title', 'Job_title') || null,
        website: pick(row, 'company_website', 'Company_website') || null,
        linkedin_url: pick(row, 'linkedin', 'Linkedin', 'LinkedIn') || null,
        phone: pick(row, 'phone', 'Phone') || null,
        location: pick(row, 'country', 'Country') || null,
        industry: pick(row, 'industry', 'Industry') || null,
        verification_status: mapVerificationStatus(row['verification_status']?.trim() || ''),
        personalized_line: pick(row, 'ai_first_line', 'Ai_first_line') || null,
        department: pick(row, 'functional_level', 'Functional_level') || null,
        seniority: pick(row, 'seniority_level', 'Seniority_level') || null,
        org_city: pick(row, 'company_city', 'Company_city') || null,
        org_state: pick(row, 'company_state', 'Company_state') || null,
        org_country: pick(row, 'company_country', 'Company_country') || null,
        org_description: pick(row, 'company_description', 'Company_description') || null,
        org_founded_year: pick(row, 'company_founded_year', 'Company_founded_year') || null,
        org_size: pick(row, 'company_size', 'Company_size') || null,
        org_linkedin_url: pick(row, 'company_linkedin', 'Company_linkedin') || null,
        raw_data: Object.keys(rawData).length ? rawData : null,
        created_at: parseDate(pick(row, 'Creation Date', 'Created Date')) ?? new Date().toISOString(),
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
    const userEmail = pick(row, 'user', 'User');
    const campaignBubbleId = row['Campaign']?.trim() || row['campaign']?.trim() || '';
    const workspaceId = workspaceMap.get(userEmail);

    if (!workspaceId) continue;

    // Use credits as the amount; fall back to amount_paid
    const amount = parseInt(row['credits']?.trim() || row['amount_paid']?.trim() || '0', 10) || 0;

    const { error } = await supabase.from('lead_credit_transactions').insert({
      workspace_id: workspaceId,
      amount,
      type: mapTxType(pick(row, 'Transaction Type', 'Transaction_Type', 'transaction_type')),
      description: pick(row, 'Description', 'description') || null,
      lead_campaign_id: campaignMap.get(campaignBubbleId) || null,
      created_at: parseDate(pick(row, 'Creation Date', 'Created Date')) ?? new Date().toISOString(),
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

  // Print ALL column headers + first row values for each CSV
  for (const f of found.filter(f => f.endsWith('.csv'))) {
    const rows = readCsv(f);
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      console.log(`\n   ── ${f} (${rows.length} rows, ${cols.length} cols) ──`);
      for (const col of cols) {
        const sampleVal = rows[0][col];
        console.log(`      "${col}" = ${JSON.stringify(sampleVal)}`);
      }
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
