/** "just now", "12 min ago", "3 h ago", "2 d ago"; null for no time. */
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
