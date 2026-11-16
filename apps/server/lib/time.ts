/** "16 Nov, 10:00" in the viewer's locale: a day and a time, for anything that is due. */
export const dayTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Now as a datetime-local value (local time, minutes), for an input's `min` so a past time can't be picked. */
export const nowLocalInput = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** "just now", "12 min ago", "3 h ago", "2 d ago"; null for no time. */
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
