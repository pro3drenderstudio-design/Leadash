import postgres from "postgres";

let _client: ReturnType<typeof postgres> | null = null;

function client(): ReturnType<typeof postgres> {
  if (_client) return _client;
  const url = process.env.LEADS_DB_URL;
  if (!url) throw new Error("LEADS_DB_URL environment variable is not set");
  _client = postgres(url, {
    max:             10,
    idle_timeout:    30,
    connect_timeout: 10,
    prepare:         false,
    ssl:             false,
    // Startup parameters applied to every connection in this pool. The 25s
    // statement_timeout means a runaway search on discover_people (559M rows)
    // fails deterministically with SQLSTATE 57014 — which /discover/search
    // now classifies as 504 "narrow your filters" — instead of hanging until
    // PgBouncer eventually kills it and surfaces as a generic error. The row
    // query races a 12s count in Promise.all, so 25s leaves comfortable
    // headroom for the actual data pull.
    // Cast to allow string GUC values ("25s") — postgres.js typings insist on
    // number for the connection object, but Postgres itself accepts either.
    connection: {
      statement_timeout:                   "25s",
      idle_in_transaction_session_timeout: "60s",
      application_name:                    "leadash-web",
    } as unknown as Record<string, number>,
  });
  return _client;
}

// Lazy proxy — initialized on first method access at request time, not module load
const leadsDb: Pick<ReturnType<typeof postgres>, "unsafe" | "end"> = {
  unsafe: (...args: Parameters<ReturnType<typeof postgres>["unsafe"]>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client().unsafe as any)(...args),
  end: (...args: Parameters<ReturnType<typeof postgres>["end"]>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client().end as any)(...args),
};

export default leadsDb;
