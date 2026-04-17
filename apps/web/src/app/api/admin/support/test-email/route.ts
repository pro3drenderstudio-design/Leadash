import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(_: NextRequest) {
  // Admin-only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const postalHost   = process.env.POSTAL_HOST;
  const postalApiKey = process.env.POSTAL_API_KEY;
  const postalFrom   = process.env.POSTAL_FROM ?? process.env.RESEND_FROM_EMAIL;
  const resendKey    = process.env.RESEND_API_KEY;

  const config = {
    POSTAL_HOST:    postalHost   ? "set" : "MISSING",
    POSTAL_API_KEY: postalApiKey ? "set" : "MISSING",
    POSTAL_FROM:    postalFrom   ?? "MISSING",
    RESEND_API_KEY: resendKey    ? "set" : "MISSING",
  };

  if (!postalHost || !postalApiKey) {
    return NextResponse.json({ ok: false, config, error: "POSTAL_HOST or POSTAL_API_KEY not set" });
  }

  try {
    const res = await fetch(`https://${postalHost}/api/v1/send/message`, {
      method: "POST",
      headers: {
        "X-Server-API-Key": postalApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:       `Leadash Test <${postalFrom}>`,
        to:         [user.email],
        subject:    "Leadash email test",
        plain_body: "This is a test email from Leadash. If you received this, email sending is working correctly.",
        html_body:  "<p>This is a test email from Leadash. If you received this, email sending is working correctly.</p>",
      }),
    });

    const body = await res.json();
    return NextResponse.json({ ok: res.ok, status: res.status, config, postal_response: body });
  } catch (err) {
    return NextResponse.json({ ok: false, config, error: String(err) });
  }
}
