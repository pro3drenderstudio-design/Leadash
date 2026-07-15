/**
 * Instagram DM attachment helper — unlike WhatsApp, Meta's Instagram webhook
 * gives a directly-fetchable CDN url in the payload (no media-id lookup step).
 * Binary types (image/video/audio) are downloaded and re-hosted in our own
 * storage so they stay reachable after Meta's CDN link expires — mirroring
 * the WhatsApp media pattern in `@/lib/whatsapp/media`. Non-binary shares
 * (reposted posts/reels, story mentions, generic templates) are linked
 * directly rather than downloaded, since they render fine as a plain link
 * chip and may not be raw media bytes at all.
 */
import { createAdminClient } from "@/lib/supabase/server";

export interface InstagramRichAttachment {
  name:     string;
  mimeType: string;
  size:     number;
  url:      string;
}

const LABEL_BY_TYPE: Record<string, string> = {
  image:         "Photo",
  video:         "Video",
  audio:         "Voice message",
  share:         "Shared post",
  ig_reel:       "Shared reel",
  story_mention: "Story mention",
  template:      "Message",
  fallback:      "Attachment",
};

export function instagramAttachmentLabel(type: string): string {
  return LABEL_BY_TYPE[type] ?? "Attachment";
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/mp4": "m4a",
};

/** Downloads + re-hosts binary media (image/video/audio) attachments. Returns
 *  null for anything that isn't fetchable binary media — callers should fall
 *  back to linking the original url directly in that case. */
export async function fetchInstagramMedia(
  url: string,
  mid: string,
  index: number,
): Promise<InstagramRichAttachment | null> {
  try {
    const fileRes = await fetch(url);
    if (!fileRes.ok) return null;

    const contentType = (fileRes.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^(image|video|audio)\//.test(contentType)) return null;

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const ext  = EXT_BY_MIME[contentType] ?? contentType.split("/")[1] ?? "bin";
    const path = `instagram/${mid}-${index}.${ext}`;

    const db = createAdminClient();
    const { error: uploadError } = await db.storage
      .from("crm-media")
      .upload(path, buffer, { contentType, upsert: true });
    if (uploadError) {
      console.error("[instagram-media] storage upload failed:", uploadError.message);
      return null;
    }

    const { data: signed } = await db.storage
      .from("crm-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year, matches WhatsApp media convention
    if (!signed?.signedUrl) return null;

    return { name: `${mid}-${index}.${ext}`, mimeType: contentType, size: buffer.length, url: signed.signedUrl };
  } catch (e) {
    console.error("[instagram-media] fetch failed:", e);
    return null;
  }
}
