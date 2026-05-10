import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getMuxAsset } from "@/lib/academy/mux";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { data, error } = await db.from("academy_lessons").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ lesson: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // If mux_upload_id is provided and no asset_id yet, poll Mux for the asset
  if (body.mux_upload_id && !body.mux_asset_id) {
    try {
      const Mux = (await import("@mux/mux-node")).default;
      const muxClient = new Mux({ tokenId: process.env.MUX_TOKEN_ID!, tokenSecret: process.env.MUX_TOKEN_SECRET! });
      const upload = await muxClient.video.uploads.retrieve(body.mux_upload_id as string);
      if (upload.asset_id) {
        const asset = await getMuxAsset(upload.asset_id);
        body = {
          ...body,
          mux_asset_id:    upload.asset_id,
          mux_playback_id: asset.playbackId,
          duration_secs:   asset.durationSecs,
        };
      }
    } catch { /* upload not ready yet — patch without asset info */ }
  }

  const { data, error } = await db.from("academy_lessons").update(body).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lesson: data });
}
