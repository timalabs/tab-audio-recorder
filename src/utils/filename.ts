/**
 * Formats a Date object into YYYY-MM-DD-HH-mm-ss string.
 */
export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
}

/**
 * Sanitizes a title string into a safe filename component.
 * Removes illegal filesystem characters, trims whitespace, limits length.
 */
export function sanitizeTitle(rawTitle?: string, maxLength: number = 60): string {
  if (!rawTitle) return '';

  // Remove invalid filesystem chars: \ / : * ? " < > | and ASCII control characters
  let cleaned = rawTitle
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    // Replace whitespace, underscores, and consecutive dashes with a single dash
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    // Trim dashes and dots from edges
    .replace(/^[-.]+|[-.]+$/g, '')
    .trim();

  if (cleaned.length > maxLength) {
    // Cut off cleanly without trailing hyphen
    cleaned = cleaned.slice(0, maxLength).replace(/-+$/, '');
  }

  return cleaned;
}

/**
 * Generates an automatic filename for the recording.
 * Example: "My-Music-Generator-2026-09-27-21-45-12.webm" or "tab-recording-2026-09-27-21-45-12.webm"
 */
export function generateRecordingFilename(
  title?: string,
  extension: string = 'webm',
  date: Date = new Date()
): string {
  const timestamp = formatTimestamp(date);
  const safeTitle = sanitizeTitle(title);
  const cleanExt = extension.replace(/^\.+/, '');

  if (safeTitle) {
    return `${safeTitle}-${timestamp}.${cleanExt}`;
  }
  return `tab-recording-${timestamp}.${cleanExt}`;
}
