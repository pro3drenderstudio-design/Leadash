import { NextResponse } from "next/server";

// TEMPORARY: staging debug — remove after fix is confirmed
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "MISSING";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "MISSING";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "MISSING";

  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_prefix: anonKey.slice(0, 40) + "...",
    SUPABASE_SERVICE_ROLE_KEY_prefix: serviceKey.slice(0, 40) + "...",
    SUPABASE_SERVICE_ROLE_KEY_ref: serviceKey.split(".")[1]
      ? JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64").toString()).ref ?? "parse-error"
      : "invalid-jwt",
  });
}
