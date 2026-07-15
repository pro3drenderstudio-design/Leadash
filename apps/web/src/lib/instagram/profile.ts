const GRAPH_API = "https://graph.facebook.com/v21.0";

/** Fetches an Instagram-scoped user's real name from the Graph API — used both
 *  when a new contact is created (inbound-instagram webhook) and when
 *  backfilling names for contacts created before a token was configured. */
export async function fetchInstagramProfile(igsid: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_API}/${igsid}?fields=name,username&access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) return null;
    const data = await res.json() as { name?: string; username?: string };
    return data.name ?? data.username ?? null;
  } catch {
    return null;
  }
}
