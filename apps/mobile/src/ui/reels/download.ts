import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { reels } from "@/api/endpoints";

/**
 * Download = sending the reel out by hand: the server approves this version (studio reels: the maker may),
 * then the MP4 goes to the phone's share sheet (Save to device, Instagram, …).
 */
export async function downloadReel(id: string, version: number, title?: string) {
  const { videoUrl } = await reels.download(id, version);
  const file = await File.downloadFileAsync(videoUrl, new File(Paths.cache, `reel-${id}-v${version}.mp4`), { idempotent: true });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "video/mp4", dialogTitle: title });
}
