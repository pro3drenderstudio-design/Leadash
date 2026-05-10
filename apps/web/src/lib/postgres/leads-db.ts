import postgres from "postgres";

const connectionString = process.env.LEADS_DB_URL;
if (!connectionString) throw new Error("LEADS_DB_URL environment variable is not set");

// Single connection pool shared across the process
const leadsDb = postgres(connectionString, {
  max:          10,
  idle_timeout: 30,
  connect_timeout: 10,
  // Self-signed cert on VPS — verify disabled, traffic still encrypted
  ssl: { rejectUnauthorized: false },
});

export default leadsDb;
