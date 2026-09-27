/**
 * Formats a duration in milliseconds into MM:SS or HH:MM:SS.
 * Example: 64000ms -> "01:04", 3661000ms -> "01:01:01"
 */
export function formatDuration(ms: number): string {
  if (!ms || ms < 0 || !isFinite(ms)) {
    return '00:00';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Calculates elapsed milliseconds since a timestamp.
 */
export function getElapsedMs(startedAt?: number): number {
  if (!startedAt) return 0;
  return Math.max(0, Date.now() - startedAt);
}
