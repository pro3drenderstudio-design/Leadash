import { NextRequest } from "next/server";

export function requireVendorAuth(req: NextRequest): boolean {
  const token    = req.cookies.get("vendor_token")?.value;
  const expected = process.env.VENDOR_PORTAL_SECRET;
  return !!(expected && token && token === expected);
}
