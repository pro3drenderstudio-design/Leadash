/**
 * WhatsApp (Meta Cloud API) media helpers — download (inbound) and upload
 * (outbound).
 *
 * Inbound: Meta never sends media bytes in the webhook — only a media ID.
 * Retrieving the file is a two-step flow: resolve the ID to a short-lived
 * CDN URL, then fetch that URL with the same bearer token. We then persist
 * the bytes to our own storage so the file remains reachable after Meta's
 * URL expires.
 *
 * Outbound: sending a media message is the reverse two-step flow — upload
 * the file's bytes to Meta first (returns a media ID), then reference that
 * ID in the actual message send.
 */
import { createAdminClient } from "@/lib/supabase/server";

/** Meta's supported outbound message categories for a given mime type. */
export function whatsAppMediaType(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Meta's media upload endpoint only accepts a fixed, narrow list of MIME
 * types per category and rejects the whole upload if given anything else —
 * notably it wants `audio/mp4` for m4a audio, not the `audio/x-m4a` (or
 * similar OS/browser-specific variant) that voice-memo recordings actually
 * report. Our own storage bucket accepts the broader real-world set; this
 * narrows just the value sent to Meta.
 */
function normalizeMimeForMeta(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/x-m4a":     "audio/mp4",
    "audio/mp4a-latm": "audio/mp4",
    "audio/x-caf":     "audio/aac",
  };
  return map[mimeType] ?? mimeType;
}

/** Uploads a file's bytes to Meta and returns the resulting media ID. */
export async function uploadWhatsAppMedia(
  phoneNumberId: string,
  accessToken: string,
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string | null> {
  try {
    const metaMimeType = normalizeMimeForMeta(mimeType);
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", new Blob([new Uint8Array(buffer)], { type: metaMimeType }), filename);

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body:    form,
    });
    if (!res.ok) {
      console.error(`[whatsapp-media] upload failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json() as { id?: string };
    return data.id ?? null;
  } catch (e) {
    console.error("[whatsapp-media] upload failed:", e);
    return null;
  }
}

export interface WhatsAppMediaResult {
  name:     string;
  mimeType: string;
  size:     number;
  url:      string;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr",
  "video/mp4": "mp4", "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

export async function fetchWhatsAppMedia(
  mediaId: string,
  accessToken: string,
  filenameHint?: string,
): Promise<WhatsAppMediaResult | null> {
  try {
    // Step 1: resolve the media ID to a short-lived CDN URL + metadata.
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      console.error(`[whatsapp-media] metadata lookup failed for ${mediaId}: ${metaRes.status}`);
      return null;
    }
    const meta = await metaRes.json() as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) return null;

    // Step 2: download the actual bytes — requires the same bearer token.
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fileRes.ok) {
      console.error(`[whatsapp-media] download failed for ${mediaId}: ${fileRes.status}`);
      return null;
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const mimeType = (meta.mime_type ?? "application/octet-stream").split(";")[0].trim();
    const ext  = EXT_BY_MIME[mimeType] ?? mimeType.split("/")[1]?.split(";")[0] ?? "bin";
    const name = filenameHint ?? `${mediaId}.${ext}`;
    const path = `whatsapp/${mediaId}.${ext}`;

    const db = createAdminClient();
    const { error: uploadError } = await db.storage
      .from("crm-media")
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (uploadError) {
      console.error("[whatsapp-media] storage upload failed:", uploadError.message);
      return null;
    }

    const { data: signed } = await db.storage
      .from("crm-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year, matches reply-attachments convention
    if (!signed?.signedUrl) return null;

    return { name, mimeType, size: buffer.length, url: signed.signedUrl };
  } catch (e) {
    console.error("[whatsapp-media] fetch failed:", e);
    return null;
  }
}
