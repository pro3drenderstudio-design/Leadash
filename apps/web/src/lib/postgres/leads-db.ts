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
    ssl: false,
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
