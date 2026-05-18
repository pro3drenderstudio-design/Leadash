import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// Columns that are boolean in the DB but the UI treats as "true"/"false" strings
const BOOL_COLS = ["footer_enabled", "track_opens_default", "track_clicks_default"] as const;
// Columns that are int in the DB but the UI treats as numeric strings
const INT_COLS  = ["default_daily_limit"] as const;

/** Normalize DB row → UI-safe object (booleans → "true"/"false" strings, ints → strings) */
function toUi(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of BOOL_COLS) {
    if (out[k] !== undefined && out[k] !== null) out[k] = String(out[k]);
  }
  for (const k of INT_COLS) {
    if (out[k] !== undefined && out[k] !== null) out[k] = String(out[k]);
  }
  return out;
}

/** Normalize UI payload → DB types before upsert */
function toDb(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const k of BOOL_COLS) {
    if (out[k] !== undefined) out[k] = out[k] === "true" || out[k] === true;
  }
  for (const k of INT_COLS) {
    if (out[k] !== undefined && out[k] !== null && out[k] !== "") {
      const n = parseInt(String(out[k]), 10);
      if (!isNaN(n)) out[k] = n;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data } = await db
    .from("workspace_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const fallback = {
    footer_enabled: true, footer_custom_text: null, footer_address: null,
    track_opens_default: true, track_clicks_default: true,
    default_daily_limit: 30, default_timezone: "America/New_York",
    default_send_start: "09:00", default_send_end: "17:00",
  };

  return NextResponse.json(toUi((data ?? fallback) as Record<string, unknown>));
}

export async function POST(req: NextRequest) {
  return PATCH(req);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as Record<string, unknown>;
  const update = toDb({ ...body, workspace_id: workspaceId, updated_at: new Date().toISOString() });

  const { data, error } = await db
    .from("workspace_settings")
    .upsert(update, { onConflict: "workspace_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toUi(data as Record<string, unknown>));
}
