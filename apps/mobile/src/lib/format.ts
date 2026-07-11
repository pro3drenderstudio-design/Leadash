export function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days  < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export function leadName(lead: { first_name?: string | null; last_name?: string | null; email?: string } | null | undefined): string {
  if (!lead) return "Unknown";
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return name || lead.email || "Unknown";
}
