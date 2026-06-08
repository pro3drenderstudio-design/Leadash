/**
 * Validates that a file the user picked is actually a CSV — guards against the
 * native file dialog letting users select images/audio/etc. via "All files".
 *
 * Checks both the filename extension and the reported MIME type. We accept the
 * common MIME types browsers report for CSVs across OSes (text/csv,
 * application/csv, text/plain, application/vnd.ms-excel for Windows-saved CSVs)
 * and accept an empty MIME type as a fallback because some browsers report nothing.
 *
 * Note: this is a client-side gate. If the file content matters downstream
 * (e.g. CSV parsing on the server), do an additional content-shape check there.
 */

const CSV_EXTENSIONS = [".csv"];
const CSV_MIME_TYPES = new Set<string>([
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "",  // some browsers report nothing for .csv
]);

export type FileValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateCsvFile(file: File): FileValidationResult {
  const name = file.name.toLowerCase();
  const hasValidExt = CSV_EXTENSIONS.some(ext => name.endsWith(ext));
  if (!hasValidExt) {
    return { ok: false, error: `Only .csv files are supported. You selected "${file.name}".` };
  }
  if (!CSV_MIME_TYPES.has(file.type)) {
    return { ok: false, error: `Unsupported file format (${file.type || "unknown"}). Please upload a CSV.` };
  }
  return { ok: true };
}
