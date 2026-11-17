/** Brand look and photo library: GET/PATCH …/brands/:b/assets, POST …/brands/:b/media (library=1). */
export type StoredImage = { key: string; url: string };

export const TONES = [
  "Warm", "Playful", "Bold", "Calm", "Romantic", "Edgy",
  "Modern", "Minimalist", "Rustic", "Vintage", "Bohemian", "Industrial", "Scandinavian", "Coastal",
  "Luxurious", "Premium", "Elegant", "Affordable", "Artisanal", "Sustainable", "Natural", "Family-friendly",
] as const;
export type Tone = (typeof TONES)[number];

/** Grouped so every kind of business finds itself, not only upscale ones. Same split as the phone's tones.ts. */
export const TONE_GROUPS: readonly { key: "feel" | "style" | "positioning"; tones: readonly Tone[] }[] = [
  { key: "feel", tones: TONES.slice(0, 6) },
  { key: "style", tones: TONES.slice(6, 14) },
  { key: "positioning", tones: TONES.slice(14) },
];

export type BrandAssetsView = {
  name: string;
  website: string | null;
  /** Business address (Google Maps listing or the owner's own words) and type, e.g. "Furniture store"; null when unknown. */
  location: string | null;
  category: string | null;
  /** Null until Research collected them (or the brand has no website). */
  assets: {
    logo: StoredImage | null;
    colors: { hex: string; from: "site" | "logo" | "products" | "you" }[];
    /** Set once a person edited the palette; Research keeps their colours from then on. */
    colorsEditedAt: string | null;
    fonts: string[];
    products: { title: string; kind: string | null; url: string; image: StoredImage | null }[];
  } | null;
  /** Photos the owner added to the library (Business M08), newest first. */
  uploads: { title: string; addedAt: string; image: StoredImage | null }[];
  /** Research's short summary (A09); null until written. Tags and sentences are English, the tagline is the site's own. */
  /** `foundWebsite`: a brand made without a website whose own site the online lookup found, for the owner to accept. */
  summary: { tagline: string | null; tags: string[]; audience: string | null; strengths: string | null; foundWebsite: string | null } | null;
  /** The owner's A10 choices; null fields = not chosen yet. */
  preferences: { tones: Tone[] | null; contentLanguage: "fr" | "en" | null };
};
export type BrandDetailsEdit = { colors?: string[]; tagline?: string; audience?: string; tones?: Tone[]; contentLanguage?: "fr" | "en"; removeUpload?: string };

export const MAX_COLORS = 5;
/** A cap so the profile's JSON list stays small; a table if brands need bigger libraries. */
export const LIBRARY_MAX = 60;
/** Largest image POST …/media takes (hosting caps bodies at 4.5 MB). */
export const MEDIA_MAX_BYTES = 4 * 1024 * 1024;

/** `7c6754`, `#abc` → `#7C6754` / `#AABBCC`; null when it isn't a hex colour. Same rule as the server. */
export function normalizeHex(raw: string) {
  const v = raw.trim().replace(/^#/, "").toUpperCase();
  if (!/^([0-9A-F]{3}|[0-9A-F]{6})$/.test(v)) return null;
  return `#${v.length === 3 ? [...v].map((c) => c + c).join("") : v}`;
}

export const hslToHex = (h: number, s: number, l: number) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [(h + 360) % 360, s * 100, l * 100];
}

/** Same colour, `step` points lighter (+) or darker (−), within 4–96%; already past the limit → unchanged (never the opposite way). */
export function shade(hex: string, step: number) {
  const [h, s, l] = hexToHsl(hex);
  const next = Math.min(96, Math.max(4, l + step));
  return (step > 0 && next <= l) || (step < 0 && next >= l) ? hex : hslToHex(h, s, next);
}

// Picker: pick a named colour, then one of its five shades. Muted saturation, so every pick looks like a
// brand colour, not a neon. Names: onboarding:brand.hues.<key>; shades: onboarding:brand.shades.<key>.
export const HUES = [
  { key: "red", h: 0, s: 55 },
  { key: "orange", h: 25, s: 60 },
  { key: "yellow", h: 45, s: 60 },
  { key: "green", h: 95, s: 35 },
  { key: "teal", h: 170, s: 40 },
  { key: "blue", h: 210, s: 50 },
  { key: "purple", h: 265, s: 40 },
  { key: "pink", h: 325, s: 45 },
  { key: "brown", h: 25, s: 30 },
  { key: "grey", h: 0, s: 0 },
];
export const SHADES = [
  { key: "lightest", l: 85 },
  { key: "light", l: 68 },
  { key: "medium", l: 50 },
  { key: "dark", l: 34 },
  { key: "darkest", l: 20 },
];

/** The picker colour closest in hue to `hex` (greys and browns by saturation), so it opens where you are. */
export function nearestHue(hex: string | null) {
  if (!hex) return 0;
  const [h, s] = hexToHsl(hex);
  if (s < 10) return HUES.length - 1;
  const dist = (a: number) => Math.min(Math.abs(a - h), 360 - Math.abs(a - h));
  let best = 0;
  HUES.forEach((c, i) => {
    if (c.s > 0 && dist(c.h) + Math.abs(c.s - s) / 4 < dist(HUES[best].h) + Math.abs(HUES[best].s - s) / 4) best = i;
  });
  return best;
}

export type LibraryPhoto = { key: string; url: string; title: string; kind: string | null };
/** Website product photos and the owner's uploads (newest first, as the server sends them). */
export function libraryPhotos(view: BrandAssetsView | null | undefined): { website: LibraryPhoto[]; uploads: LibraryPhoto[] } {
  return {
    website: (view?.assets?.products ?? []).flatMap((p) => (p.image ? [{ key: p.image.key, url: p.image.url, title: p.title, kind: p.kind }] : [])),
    uploads: (view?.uploads ?? []).flatMap((u) => (u.image ? [{ key: u.image.key, url: u.image.url, title: u.title, kind: null }] : [])),
  };
}
