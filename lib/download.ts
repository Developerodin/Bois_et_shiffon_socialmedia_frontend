import { ApiError } from "@/components/settings/api";
import { CLIENT_TAG } from "@/lib/net";

/**
 * Fetches `url` and saves it as `filename`. Fetched first (not a plain link) so a refusal shows its message
 * where the button is instead of downloading as a file.
 * ponytail: the whole file sits in memory as a blob; a zip of five long clips makes a few hundred MB.
 */
export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url, { cache: "no-store", headers: { "X-Client": CLIENT_TAG } });
  if (!res.ok) {
    const p = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
    throw new ApiError(res.status, p?.detail || p?.title || "The download didn’t start. Try again.");
  }
  const blob = await res.blob().catch(() => {
    throw new ApiError(0, "The download stopped partway. Try again.");
  });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
