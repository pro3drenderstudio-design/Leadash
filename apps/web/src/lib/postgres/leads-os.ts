import https from "node:https";

/**
 * Minimal OpenSearch client for the Discover indexes (people + companies),
 * hosted on the dedicated VDS. Dependency-free: uses node:https directly so it
 * works in the Node runtime the Discover routes already require (postgres).
 *
 * TLS: the node uses OpenSearch's bundled demo certificate (self-signed), so we
 * connect with rejectUnauthorized:false. The path is Vercel → VDS server-to-
 * server, protected by TLS + basic auth on a firewalled port; the cert only
 * lacks a public CA chain. Swap in a real cert + pinning if this ever fronts
 * anything more sensitive.
 */
const AGENT = new https.Agent({
  keepAlive:          true,
  maxSockets:         24,
  rejectUnauthorized: false,
});

function osConfig(): { base: string; auth: string } {
  const base = process.env.OPENSEARCH_URL;
  const user = process.env.OPENSEARCH_USER ?? "admin";
  const pass = process.env.OPENSEARCH_PASS;
  if (!base) throw new Error("OPENSEARCH_URL environment variable is not set");
  if (!pass) throw new Error("OPENSEARCH_PASS environment variable is not set");
  return { base, auth: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") };
}

export function isOpenSearchConfigured(): boolean {
  return !!process.env.OPENSEARCH_URL && !!process.env.OPENSEARCH_PASS;
}

export async function osRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<T> {
  const { base, auth } = osConfig();
  const url = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : base + "/");
  const payload = body !== undefined ? JSON.stringify(body) : undefined;

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        agent: AGENT,
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch (e) {
              reject(e);
            }
          } else {
            const err = new Error(`OpenSearch ${status}: ${data.slice(0, 300)}`) as Error & { status?: number };
            err.status = status;
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(Object.assign(new Error("OpenSearch request timeout"), { timedOut: true })));
    if (payload) req.write(payload);
    req.end();
  });
}

export interface OsHit<S> {
  _id: string;
  _source: S;
}
export interface OsSearchResponse<S> {
  took: number;
  timed_out: boolean;
  hits: {
    total: { value: number; relation: "eq" | "gte" };
    hits: OsHit<S>[];
  };
}

export async function osSearch<S>(index: string, body: unknown, timeoutMs = 30_000): Promise<OsSearchResponse<S>> {
  return osRequest<OsSearchResponse<S>>("POST", `/${index}/_search`, body, timeoutMs);
}
