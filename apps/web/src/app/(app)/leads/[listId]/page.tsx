import { createAdminClient } from "@/lib/supabase/server";
import ListDetailClient from "./ListDetailClient";

export default async function ListDetailPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  const db = createAdminClient();
  const { data: list } = await db
    .from("outreach_lists")
    .select("id, name")
    .eq("id", listId)
    .single();

  if (!list) return <div className="p-8 text-white/40">List not found.</div>;

  return <ListDetailClient listId={listId} listName={list.name as string} />;
}
