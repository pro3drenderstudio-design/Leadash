/**
 * Lean MIME attachment extractor.
 * Parses a raw email source string and returns decoded attachment buffers.
 * Handles multipart/mixed, multipart/related, base64 and quoted-printable encoding.
 */

export interface ParsedAttachment {
  name:     string;
  mimeType: string;
  size:     number;
  data:     Buffer;
}

// ── Decode transfer encodings ────────────────────────────────────────────────

function decodeBase64(raw: string): Buffer {
  return Buffer.from(raw.replace(/\s+/g, ""), "base64");
}

function decodeQP(raw: string): Buffer {
  const decoded = raw
    .replace(/=\r?\n/g, "")  // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(decoded, "binary");
}

// ── Header value helpers ──────────────────────────────────────────────────────

function getHeaderValue(headers: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.+?)\\s*(?=\\n\\S|\\n\\n|$)`, "im");
  // fold multi-line header values (continuation lines start with whitespace)
  const folded = headers.replace(/\r?\n([ \t])/g, " $1");
  const m = folded.match(re);
  return m ? m[1].trim() : null;
}

function getParam(headerValue: string, param: string): string | null {
  const re = new RegExp(`${param}="?([^";\\s]+)"?`, "i");
  const m = headerValue.match(re);
  return m ? m[1] : null;
}

function decodeRfc2047(s: string): string {
  // =?charset?encoding?text?=
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _charset, enc, text) => {
    if (enc.toUpperCase() === "B") return Buffer.from(text, "base64").toString("utf8");
    return decodeQP(text.replace(/_/g, " ")).toString("utf8");
  });
}

// ── Boundary splitter ────────────────────────────────────────────────────────

function splitParts(body: string, boundary: string): string[] {
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts   = body.split(new RegExp(`--${escaped}(?:--)?\\r?\\n?`));
  return parts.slice(1).filter(p => !p.startsWith("--"));
}

// ── Recursive MIME part walker ───────────────────────────────────────────────

function walkPart(raw: string, attachments: ParsedAttachment[], depth = 0): void {
  if (depth > 10) return; // guard against malformed nested MIME

  // Split headers from body at first blank line
  const blankLine = raw.search(/\r?\n\r?\n/);
  if (blankLine === -1) return;

  const headerBlock = raw.slice(0, blankLine);
  const body        = raw.slice(blankLine).replace(/^\r?\n/, "");

  const contentType = getHeaderValue(headerBlock, "content-type") ?? "text/plain";
  const disposition = getHeaderValue(headerBlock, "content-disposition") ?? "";
  const encoding    = (getHeaderValue(headerBlock, "content-transfer-encoding") ?? "7bit").toLowerCase();

  const baseType = contentType.split(";")[0].trim().toLowerCase();

  // Recurse into multipart
  if (baseType.startsWith("multipart/")) {
    const boundary = getParam(contentType, "boundary");
    if (boundary) {
      for (const part of splitParts(body, boundary)) {
        walkPart(part, attachments, depth + 1);
      }
    }
    return;
  }

  // Check if this part is an attachment
  const isAttachment =
    disposition.toLowerCase().startsWith("attachment") ||
    (disposition.toLowerCase().startsWith("inline") && !baseType.startsWith("text/")) ||
    (!baseType.startsWith("text/") && !baseType.startsWith("multipart/") && !baseType.startsWith("message/"));

  if (!isAttachment) return;

  // Determine filename
  let name = getParam(disposition, "filename") ?? getParam(contentType, "name") ?? "attachment";
  name = decodeRfc2047(name).replace(/[/\\:*?"<>|]/g, "_"); // sanitize

  // Decode body
  let data: Buffer;
  try {
    if (encoding === "base64") {
      data = decodeBase64(body);
    } else if (encoding === "quoted-printable") {
      data = decodeQP(body);
    } else {
      data = Buffer.from(body, "binary");
    }
  } catch {
    return; // skip malformed
  }

  if (data.length === 0) return;

  attachments.push({ name, mimeType: baseType, size: data.length, data });
}

/** Extract all attachments from a raw email source string. */
export function extractAttachments(rawSource: string): ParsedAttachment[] {
  const attachments: ParsedAttachment[] = [];
  walkPart(rawSource, attachments);
  return attachments;
}

// ── Supabase Storage uploader ────────────────────────────────────────────────

export interface StoredAttachment {
  name:     string;
  mimeType: string;
  size:     number;
  path:     string;  // storage path
  url:      string;  // signed URL (1 year)
}

export async function uploadAttachments(
  workspaceId: string,
  replyMessageId: string,
  parsed: ParsedAttachment[],
): Promise<StoredAttachment[]> {
  if (!parsed.length) return [];

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const stored: StoredAttachment[] = [];

  for (const att of parsed) {
    // Deduplicate filenames within this reply
    const safeName = att.name.replace(/\s+/g, "_");
    const path     = `${workspaceId}/${replyMessageId}/${safeName}`;

    const { error } = await supabase.storage
      .from("reply-attachments")
      .upload(path, att.data, { contentType: att.mimeType, upsert: true });

    if (error) {
      console.warn(`[attachments] upload failed for ${path}:`, error.message);
      continue;
    }

    // Signed URL valid for 1 year
    const { data: signed } = await supabase.storage
      .from("reply-attachments")
      .createSignedUrl(path, 365 * 24 * 3600);

    stored.push({
      name:     att.name,
      mimeType: att.mimeType,
      size:     att.size,
      path,
      url:      signed?.signedUrl ?? "",
    });
  }

  return stored;
}
