import http from "http";
import { checkDomains } from "./lib/namecheap";

const PORT   = Number(process.env.WORKER_HTTP_PORT ?? 3099);
const SECRET = process.env.WORKER_API_SECRET ?? "";

export function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    const auth = req.headers["authorization"];
    if (SECRET && auth !== `Bearer ${SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const url = new URL(req.url!, `http://localhost:${PORT}`);

    if (req.method === "GET" && url.pathname === "/domains/check") {
      const raw   = url.searchParams.get("domains") ?? "";
      const names = raw.split(",").map(d => d.trim().toLowerCase()).filter(Boolean).slice(0, 20);

      if (!names.length) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No domains provided" }));
        return;
      }

      try {
        const results = await checkDomains(names);
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(results));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[worker-server] Listening on port ${PORT}`);
  });
}
