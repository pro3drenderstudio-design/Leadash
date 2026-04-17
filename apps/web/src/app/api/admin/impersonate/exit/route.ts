import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const refreshToken   = cookieStore.get("admin_impersonate_rt")?.value;
  const adminId        = cookieStore.get("admin_impersonate_uid")?.value;

  const clearCookies = (res: NextResponse) => {
    res.cookies.set("admin_impersonate_rt",  "", { maxAge: 0, path: "/" });
    res.cookies.set("admin_impersonate_uid", "", { maxAge: 0, path: "/" });
    res.cookies.set("admin_impersonating",   "", { maxAge: 0, path: "/" });
    return res;
  };

  if (!refreshToken) {
    // No stored token — just clear cookies and redirect to login
    return clearCookies(NextResponse.redirect(new URL("/login", req.url)));
  }

  // Restore admin session using the stored refresh token
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          // We'll apply these to the response
        },
      },
    }
  );

  const { data: { session }, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

  // Audit log exit — non-fatal
  if (adminId && session?.user?.id) {
    const adminDb = createAdminClient();
    adminDb.from("admin_impersonation_logs").insert({
      admin_id:  adminId,
      target_id: session.user.id,
      action:    "exit",
    }).then(() => null).catch(() => null);
  }

  const res = NextResponse.redirect(new URL("/admin", req.url));
  clearCookies(res);

  if (session) {
    // Supabase SSR stores the session in sb-[ref]-auth-token cookies
    // Manually set them so the admin is signed back in
    const tokenData = JSON.stringify([session.access_token, session.refresh_token]);
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
    const cookieName = `sb-${projectRef}-auth-token`;
    res.cookies.set(cookieName, tokenData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return res;
}
