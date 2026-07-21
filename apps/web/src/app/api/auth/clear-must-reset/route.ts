/**
 * POST /api/auth/clear-must-reset
 *
 * Called by the reset-password page after the user successfully sets a new
 * password from the forced-first-login flow. Clears the
 * user_metadata.must_change_password flag so the app-layout gate stops
 * redirecting them. Uses the admin client because updating your own
 * user_metadata via the user-scoped client is allowed only for a narrow
 * set of fields and can race with the password update.
 *
 * Only the authenticated user can clear their own flag. Admins never clear
 * it on someone else's behalf — a fresh admin reset re-sets the flag.
 */
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const existingMeta = (user.user_metadata as Record<string, unknown>) ?? {};
  if (existingMeta.must_change_password !== true) {
    return NextResponse.json({ ok: true, cleared: false });
  }

  const { must_change_password: _drop, ...rest } = existingMeta;
  void _drop;
  const { error } = await admin.auth.admin.updateUserById(user.id, { user_metadata: rest });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, cleared: true });
}
