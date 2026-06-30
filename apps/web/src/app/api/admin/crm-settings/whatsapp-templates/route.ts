/**
 * GET  /api/admin/crm-settings/whatsapp-templates
 *   Syncs templates from Meta Graph API into the local whatsapp_templates cache,
 *   then returns the cached list. Returns { templates: [], connected: false } when
 *   WhatsApp is not yet connected.
 *
 * POST /api/admin/crm-settings/whatsapp-templates
 *   Submits a new template to Meta for approval and caches the pending record locally.
 *   Body: { name, category, language, body_text, footer_text?, example_params? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const GRAPH_VERSION = "v21.0";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

async function getWhatsappCreds(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db
    .from("crm_channel_configs")
    .select("config, credentials")
    .eq("channel", "whatsapp")
    .single();
  if (!data) return null;
  const wabaId     = (data.config as Record<string, string> | null)?.waba_id;
  const accessToken = (data.credentials as Record<string, string> | null)?.access_token;
  if (!wabaId || !accessToken) return null;
  return { wabaId, accessToken };
}

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const creds = await getWhatsappCreds(db);
  if (!creds) {
    return NextResponse.json({ templates: [], connected: false });
  }

  // Fetch from Meta
  const metaRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${creds.wabaId}/message_templates?fields=name,status,category,language,components,id,rejected_reason&limit=100`,
    { headers: { Authorization: `Bearer ${creds.accessToken}` } },
  );

  if (metaRes.ok) {
    const metaData = await metaRes.json() as { data?: Array<{
      id: string; name: string; status: string; category: string;
      language: string; components: unknown[]; rejected_reason?: string;
    }> };

    const rows = (metaData.data ?? []).map(t => ({
      meta_template_id: t.id,
      name:             t.name,
      language:         t.language,
      category:         t.category as "MARKETING" | "UTILITY" | "AUTHENTICATION",
      status:           t.status as "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED",
      components:       t.components ?? [],
      rejected_reason:  t.rejected_reason ?? null,
      updated_at:       new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await db.from("whatsapp_templates").upsert(rows, { onConflict: "name,language" });
    }
  }

  // Return local cache (always, even if Meta call failed — stale is better than empty)
  const { data: cached } = await db
    .from("whatsapp_templates")
    .select("id, meta_template_id, name, language, category, status, components, rejected_reason, updated_at")
    .order("name");

  return NextResponse.json({ templates: cached ?? [], connected: true });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const creds = await getWhatsappCreds(db);
  if (!creds) return NextResponse.json({ error: "WhatsApp not connected" }, { status: 400 });

  const body = await req.json() as {
    name:            string;
    category:        "MARKETING" | "UTILITY" | "AUTHENTICATION";
    language:        string;
    body_text:       string;
    footer_text?:    string;
    example_params?: string[];
  };

  if (!body.name || !body.category || !body.language || !body.body_text) {
    return NextResponse.json({ error: "name, category, language, body_text are required" }, { status: 400 });
  }

  if (!/^[a-z0-9_]+$/.test(body.name)) {
    return NextResponse.json({ error: "Template name must be lowercase letters, digits, and underscores only" }, { status: 400 });
  }

  // Build Meta components array
  const hasPlaceholders = /\{\{\d+\}\}/.test(body.body_text);
  const bodyComponent: Record<string, unknown> = { type: "BODY", text: body.body_text };
  if (hasPlaceholders && body.example_params && body.example_params.length > 0) {
    bodyComponent.example = { body_text: [body.example_params] };
  }
  const components: unknown[] = [bodyComponent];
  if (body.footer_text) {
    components.push({ type: "FOOTER", text: body.footer_text });
  }

  const metaRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${creds.wabaId}/message_templates`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name:       body.name,
        category:   body.category,
        language:   body.language,
        components,
      }),
    },
  );

  const metaJson = await metaRes.json() as { id?: string; status?: string; error?: { message: string } };

  if (!metaRes.ok) {
    return NextResponse.json(
      { error: metaJson.error?.message ?? "Meta API error" },
      { status: metaRes.status },
    );
  }

  const { data: inserted } = await db
    .from("whatsapp_templates")
    .upsert({
      meta_template_id: metaJson.id ?? null,
      name:             body.name,
      language:         body.language,
      category:         body.category,
      status:           (metaJson.status ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED",
      components,
      updated_at:       new Date().toISOString(),
    }, { onConflict: "name,language" })
    .select()
    .single();

  return NextResponse.json({ template: inserted }, { status: 201 });
}
