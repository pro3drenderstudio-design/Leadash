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
    // Startup parameters applied to every connection in this pool. The
    // statement_timeout means a runaway search on discover_people fails
    // deterministically with SQLSTATE 57014 — which /discover/search classifies
    // as 504 "narrow your filters" — instead of hanging until PgBouncer kills
    // it. Raised 25s→40s: the working set (265GB) far exceeds RAM (47GB), so
    // cold-cache searches that hit disk need more headroom to finish rather
    // than false-fail. Once discover_people is slimmed to email-having rows
    // (~90GB, fits cache) this can drop back down.
    // Cast to allow string GUC values ("40s") — postgres.js typings insist on
    // number for the connection object, but Postgres itself accepts either.
    connection: {
      statement_timeout:                   "40s",
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
