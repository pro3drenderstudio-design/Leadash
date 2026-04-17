import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(_: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const supabase = await createClient();
  const { data: { user: adminUser } } = await supabase.auth.getUser();
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", adminUser.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  const { data: { user: target }, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !target?.email) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === adminUser.id) return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";

  // Generate a magic link for the target user, redirecting to their dashboard
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
    options: {
      redirectTo: `${APP_URL}/api/auth/callback?next=/dashboard`,
    },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: linkErr?.message ?? "Failed to generate link" }, { status: 500 });
  }

  // Get admin's current session to store for restoration
  const { data: { session: adminSession } } = await supabase.auth.getSession();

  const res = NextResponse.json({ url: linkData.properties.action_link });

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  };

  // Store admin session for restoration
  if (adminSession?.refresh_token) {
    res.cookies.set("admin_impersonate_rt", adminSession.refresh_token, cookieOpts);
  }
  res.cookies.set("admin_impersonate_uid",   adminUser.id,    cookieOpts);
  // Non-httpOnly so the banner component can read it client-side
  res.cookies.set("admin_impersonating",     JSON.stringify({ targetEmail: target.email, adminEmail: adminUser.email }), {
    ...cookieOpts,
    httpOnly: false,
  });

  return res;
}
