import { request } from "@/components/settings/api";
import { MEDIA_MAX_BYTES, normalizeHex, type BrandAssetsView, type BrandDetailsEdit, type libraryPhotos } from "@/shared";

const enc = encodeURIComponent;
const base = (w: string, b: string) => `/api/v1/workspaces/${enc(w)}/brands/${enc(b)}`;

export const brandLookUrl = (w: string, b: string) => `${base(w, b)}/assets`;
export const mediaUrl = (w: string, b: string) => `${base(w, b)}/media`;

export const libraryApi = {
  edit: (w: string, b: string, edit: BrandDetailsEdit) =>
    request<BrandAssetsView>(brandLookUrl(w, b), { method: "PATCH", body: JSON.stringify(edit) }),
  upload: (w: string, b: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    body.append("library", "1");
    body.append("title", "Photo");
    return request<{ key: string; previewUrl: string }>(mediaUrl(w, b), { method: "POST", body, headers: {}, timeoutMs: 60_000 });
  },
};

export const MAX_PER_PICK = 10;

/** The files worth sending (JPG or PNG, up to the size limit, the first ten) and a message for each one left out. */
export function pickUploads(files: readonly File[]): { files: File[]; errors: string[] } {
  const errors: string[] = [];
  const good: File[] = [];
  for (const f of files) {
    if (f.type !== "image/jpeg" && f.type !== "image/png") errors.push(`${f.name} isn't a JPG or PNG.`);
    else if (f.size > MEDIA_MAX_BYTES) errors.push(`${f.name} is over 4 MB. Images can be up to 4 MB.`);
    else good.push(f);
  }
  if (good.length > MAX_PER_PICK) errors.push(`Up to ${MAX_PER_PICK} photos at a time; the first ${MAX_PER_PICK} are being added.`);
  return { files: good.slice(0, MAX_PER_PICK), errors };
}

/** Which tab opens first: the uploads when the chosen photo is one, or when the website gave none. */
export function initialSource(lib: ReturnType<typeof libraryPhotos>, selectedKey?: string): "website" | "uploads" {
  if (selectedKey && lib.uploads.some((p) => p.key === selectedKey)) return "uploads";
  return lib.website.length === 0 && lib.uploads.length > 0 ? "uploads" : "website";
}

/** The palette after setting slot `index` to `hex` (appending for "new"), or dropping it when `hex` is null. */
export function paletteAfter(colors: readonly string[], index: number | "new", hex: string | null): string[] {
  if (index === "new") return hex === null ? [...colors] : [...colors, hex];
  return hex === null ? colors.filter((_, i) => i !== index) : colors.map((c, i) => (i === index ? hex : c));
}

/** What is wrong with the hex code typed for slot `index`, or null when it is fine. */
export function colorHint(text: string, colors: readonly string[], index: number | "new"): string | null {
  const hex = normalizeHex(text);
  if (!hex) return "Use a hex code like #7C6754";
  return colors.some((c, i) => i !== index && normalizeHex(c) === hex) ? "That colour is already in the palette" : null;
}

export const photoCount = (n: number) => (n === 1 ? "1 photo" : `${n} photos`);
