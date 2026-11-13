import { File, Paths } from "expo-file-system";
import { Album, Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";
import type { StoryPackage } from "@/api/endpoints";
import i18n from "@/i18n";

/**
 * The gallery album for a story: "Espanda - <title>". On Android expo-media-library only takes ASCII letters, digits,
 * "_", " " and "-" in an album name (RelativePath's `[\w -]` check), so accents are dropped ("é" → "e"), anything else
 * becomes a space, and the title is cut at 60.
 */
export const albumName = (title: string) => {
  const safe = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return `Espanda - ${safe || "story"}`;
};

/**
 * An approved story's frames on the phone, in frame order: downloaded to the cache one by one, then saved to the gallery
 * in an album named after the story ("saved"). Without gallery permission, the share sheet opens for one frame at a
 * time, like a reel's download ("shared").
 *
 * All or nothing: a download that stops partway throws, saying which frame, and deletes the frames already downloaded;
 * nothing reaches the gallery then. If adding to the gallery fails partway, the frames this save added are deleted
 * again (best effort: if that delete fails too, they stay). Saving the same story again adds its frames to its album
 * again (Album.get finds it by name; titles aren't unique, so two stories with the same title share an album).
 */
export async function saveFramesToGallery(pkg: StoryPackage, title: string): Promise<"saved" | "shared"> {
  const perm = await requestPermissionsAsync(false, ["photo", "video"]);
  const files: File[] = [];
  for (const f of pkg.frames) {
    try {
      const target = new File(Paths.cache, `story-frame-${f.n}.${f.kind === "video" ? "mp4" : "jpg"}`);
      files.push(await File.downloadFileAsync(f.url, target, { idempotent: true }));
    } catch {
      for (const done of files) {
        try {
          done.delete();
        } catch {
          // Already gone; the cache is the system's to clear anyway.
        }
      }
      throw new Error(i18n.t("posts:stories.byHandView.downloadStopped", { n: f.n, total: pkg.frames.length }));
    }
  }
  if (perm.granted) {
    const name = albumName(title);
    const added: Asset[] = [];
    try {
      const album = await Album.get(name);
      // One at a time, in frame order (the gallery sorts by date added); a new album then takes them in.
      for (const file of files) added.push(await Asset.create(file.uri, album ?? undefined));
      if (!album) await Album.create(name, added);
    } catch {
      await Asset.delete(added).catch(() => {});
      throw new Error(i18n.t("posts:stories.byHandView.saveFailed"));
    }
    return "saved";
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error(i18n.t("posts:stories.byHandView.noGallery"));
  for (let i = 0; i < files.length; i++) {
    await Sharing.shareAsync(files[i].uri, {
      mimeType: pkg.frames[i].kind === "video" ? "video/mp4" : "image/jpeg",
      dialogTitle: i18n.t("posts:stories.byHandView.shareTitle", { n: pkg.frames[i].n, total: files.length }),
    });
  }
  return "shared";
}
