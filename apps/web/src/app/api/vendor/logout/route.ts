import { NextResponse } from "next/server";

export async function GET() {
  const res = NextResponse.redirect(
    new URL("/vendor/login", process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com"),
  );
  res.cookies.set("vendor_token", "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   0,
    path:     "/",
  });
  return res;
}
