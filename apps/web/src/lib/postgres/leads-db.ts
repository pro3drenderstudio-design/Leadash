import postgres from "postgres";

const connectionString =
  process.env.LEADS_DB_URL ||
  "postgres://leadash_user:Ld!Disc0ver2026@89.117.51.235:5432/leadash_leads";

// Single connection pool shared across the process
const leadsDb = postgres(connectionString, {
  max:          10,
  idle_timeout: 30,
  connect_timeout: 10,
  // Self-signed cert on VPS — verify disabled, traffic still encrypted
  ssl: { rejectUnauthorized: false },
});

export default leadsDb;
