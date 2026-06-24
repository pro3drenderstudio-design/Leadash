import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/academy/lessons/:id/content
 *
 * Returns the text blocks + resources attached to one lesson. Both tables
 * have a public-read RLS policy (migration 054) so this endpoint just
 * fetches them with the admin client for simpler joins and consistent
 * empty-array semantics; no admin role required.
 *
 * Used by the lesson player to render the area under the video.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "lesson id required" }, { status: 400 });

  const db = createAdminClient();
  const [blocksRes, resourcesRes] = await Promise.all([
    db.from("academy_lesson_blocks")
      .select("id, position, block_type, content")
      .eq("lesson_id", id)
      .order("position"),
    db.from("academy_lesson_resources")
      .select("id, position, resource_type, label, description, url, file_mime, file_bytes")
      .eq("lesson_id", id)
      .order("position"),
  ]);

  if (blocksRes.error)    return NextResponse.json({ error: blocksRes.error.message    }, { status: 500 });
  if (resourcesRes.error) return NextResponse.json({ error: resourcesRes.error.message }, { status: 500 });

  return NextResponse.json({
    blocks:    blocksRes.data    ?? [],
    resources: resourcesRes.data ?? [],
  });
}
