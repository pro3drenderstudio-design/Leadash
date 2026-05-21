import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { secret } = await req.json().catch(() => ({}));
  const expected   = process.env.VENDOR_PORTAL_SECRET;

  if (!expected) {
    return NextResponse.json({ error: "Vendor portal not configured" }, { status: 503 });
  }
  if (!secret || secret !== expected) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("vendor_token", expected, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   60 * 60 * 24 * 7, // 7 days
    path:     "/",
  });
  return res;
}
