import IORedis from "ioredis";

if (!process.env.UPSTASH_REDIS_URL) {
  throw new Error("UPSTASH_REDIS_URL is required");
}

export const connection = new IORedis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  tls: process.env.UPSTASH_REDIS_URL.startsWith("rediss://") ? {} : undefined,
});

connection.on("connect", () => console.log("[Redis] Connected"));
connection.on("error",   (e) => console.error("[Redis] Error", e.message));
