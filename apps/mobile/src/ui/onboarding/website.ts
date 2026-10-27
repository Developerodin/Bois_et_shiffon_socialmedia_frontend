/**
 * "boisetchiffons.fr" → "https://boisetchiffons.fr". Same rules as the web app's lib/website.ts:
 * add https:// when missing, require a dotted host. Returns null when it can't be a website.
 */
export function normalizeWebsite(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
