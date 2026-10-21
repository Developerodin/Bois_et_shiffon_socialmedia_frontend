/** "boisetchiffons.fr/" → "https://boisetchiffons.fr". Null when it can't be a public website address. */
export function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || url.username || url.password) return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const SMALL_WORDS = new Set(["et", "de", "du", "la", "le", "les", "des", "and", "of", "the", "y", "und"]);

/** Best guess at a brand name from its domain: "www.bois-et-chiffons.fr" → "Bois et Chiffons". The user can edit it. */
export function brandNameFromWebsite(website: string): string {
  const host = new URL(website).hostname.replace(/^www\./, "");
  const label = host.split(".")[0] ?? host;
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** The URL if it is a well-formed http(s) address, else null. Use before rendering any untrusted link. */
export function safeHttpUrl(raw: string | null | undefined): URL | null {
  try {
    const u = new URL(raw ?? "");
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** "https://www.Tikamoon.com/fr" → "tikamoon.com". Null when it isn't a public http(s) site. */
export function domainOf(raw: string | null | undefined): string | null {
  const u = safeHttpUrl(raw && !/^https?:\/\//i.test(raw) ? `https://${raw.trim()}` : raw);
  if (!u || !u.hostname.includes(".")) return null;
  return u.hostname.toLowerCase().replace(/^www\./, "");
}
