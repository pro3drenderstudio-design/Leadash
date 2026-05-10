/**
 * PDL (PeopleDataLabs) bulk import script
 *
 * Reads 417 CSV chunks, filters to rows with emails, and upserts into
 * discover_people in Supabase. Saves a checkpoint so it can be resumed
 * if interrupted.
 *
 * Usage:
 *   node scripts/import-pdl.mjs "C:\Users\...\Downloads\PDL_folder"
 *
 * Columns in each CSV: a, e, liid, linkedin, n, t
 *   a = location string ("city, state, country")
 *   e = emails Python list ("['email@x.com']")
 *   n = full name ("john smith")
 *   t = telephone/phone Python list ("['1-555-000-0000']")
 *   linkedin = LinkedIn URL
 *   liid = LinkedIn slug
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE        = 500;
const CHECKPOINT_FILE   = path.resolve("scripts/pdl-checkpoint.json");
const TOTAL_CHUNKS      = 417;

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error("❌  Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const folderArg = process.argv[2];
if (!folderArg) {
  console.error("❌  Usage: node scripts/import-pdl.mjs <path-to-PDL-folder>");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// ── Checkpoint ────────────────────────────────────────────────────────────────

function loadCheckpoint() {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
  } catch {
    return { lastChunk: 0, totalInserted: 0 };
  }
}

function saveCheckpoint(lastChunk, totalInserted) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastChunk, totalInserted }));
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseEmails(raw) {
  if (!raw) return [];
  const matches = [...raw.matchAll(/['"]([^'"]+@[^'"]+)['"]/g)];
  return matches.map(m => m[1].trim().toLowerCase()).filter(e => e.includes("@") && e.includes("."));
}

function parsePhone(raw) {
  if (!raw) return null;
  const match = raw.match(/['"]([^'"]+)['"]/);
  return match ? match[1].trim() : null;
}

function parseName(raw) {
  const name = (raw || "").trim();
  const space = name.indexOf(" ");
  if (space === -1) return { first_name: name || null, last_name: null };
  return {
    first_name: name.slice(0, space) || null,
    last_name:  name.slice(space + 1) || null,
  };
}

function parseLocation(raw) {
  if (!raw) return { city: null, state: null, country: null };
  const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) return { city: null, state: null, country: parts[0] };
  if (parts.length === 2) return { city: parts[0], state: null, country: parts[1] };
  return { city: parts[0], state: parts[1], country: parts[parts.length - 1] };
}

function parseRow(line) {
  // Minimal CSV parser: handles quoted fields containing commas
  const cols = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inQuote) { inQuote = true; continue; }
    if (ch === '"' && inQuote)  { inQuote = false; continue; }
    if (ch === "," && !inQuote) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

// ── Chunk processor ───────────────────────────────────────────────────────────

async function processChunk(filePath) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
    const batch = [];
    let lines = 0, inserted = 0, skipped = 0;
    let isHeader = true;

    async function flush() {
      if (!batch.length) return;
      const toInsert = [...batch];
      batch.length = 0;
      const { error } = await db
        .from("discover_people")
        .upsert(toInsert, { onConflict: "email", ignoreDuplicates: true });
      if (error) console.error("  ⚠  upsert error:", error.message);
      else inserted += toInsert.length;
    }

    rl.on("line", async (line) => {
      if (isHeader) { isHeader = false; return; }
      lines++;
      const cols = parseRow(line);
      // cols: a=0, e=1, liid=2, linkedin=3, n=4, t=5
      const emails = parseEmails(cols[1]);
      if (!emails.length) { skipped++; return; }

      const { first_name, last_name }     = parseName(cols[4]);
      const { city, state, country }      = parseLocation(cols[0]);
      const email    = emails[0];
      const linkedin = cols[3]?.startsWith("http") ? cols[3] : null;
      const phone    = parsePhone(cols[5]);

      batch.push({ first_name, last_name, email, phone, linkedin_url: linkedin, city, state, country, email_status: "unverified", source: "pdl" });

      if (batch.length >= BATCH_SIZE) {
        rl.pause();
        await flush();
        rl.resume();
      }
    });

    rl.on("close", async () => {
      await flush();
      resolve({ lines, inserted, skipped });
    });

    rl.on("error", reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const cp = loadCheckpoint();
console.log(`\n📦  PDL Import — resuming from chunk ${cp.lastChunk + 1} / ${TOTAL_CHUNKS}`);
console.log(`    ${cp.totalInserted.toLocaleString()} rows already inserted\n`);

let totalInserted = cp.totalInserted;
const startTime = Date.now();

for (let i = cp.lastChunk + 1; i <= TOTAL_CHUNKS; i++) {
  const filePath = path.join(folderArg, `PeopleDataLabs_chunk_${i}.csv`);
  if (!fs.existsSync(filePath)) {
    console.log(`  chunk_${i}: file not found — skipping`);
    continue;
  }

  const t0 = Date.now();
  const { lines, inserted, skipped } = await processChunk(filePath);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  totalInserted += inserted;

  const pct = ((i / TOTAL_CHUNKS) * 100).toFixed(1);
  const eta = Math.round(((Date.now() - startTime) / i) * (TOTAL_CHUNKS - i) / 60000);
  console.log(`  chunk ${i.toString().padStart(3)}/${TOTAL_CHUNKS} [${pct}%] | ${inserted.toLocaleString()} inserted / ${skipped.toLocaleString()} skipped | ${elapsed}s | total: ${totalInserted.toLocaleString()} | ETA ~${eta}min`);

  saveCheckpoint(i, totalInserted);
}

console.log(`\n✅  Done — ${totalInserted.toLocaleString()} total rows inserted`);
