import postgres from "postgres";

const connectionString = process.env.LEADS_DB_URL;
if (!connectionString) throw new Error("LEADS_DB_URL environment variable is not set");

// Single connection pool shared across the process.
// prepare:false is required — PgBouncer transaction mode doesn't support named prepared statements.
const leadsDb = postgres(connectionString, {
  max:             10,
  idle_timeout:    30,
  connect_timeout: 10,
  prepare:         false,
  ssl: false,
});

export default leadsDb;
