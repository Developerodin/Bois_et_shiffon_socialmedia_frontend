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
