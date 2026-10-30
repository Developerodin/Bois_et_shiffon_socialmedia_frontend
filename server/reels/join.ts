import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

/**
 * Scene clips → one reel, with the joined voiceover. The video is stream-copied (no re-encode: ~1 s, little CPU);
 * only the voice is encoded to AAC. Needs all clips from one model run (same codec, size, frame rate).
 * ponytail: no burned-in subtitles (that's a full re-encode); Instagram's automatic captions cover it for now.
 */
export async function joinReel(clipFiles: string[], wavFile: string, outFile: string): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg isn't available on this server");
  const list = path.join(path.dirname(outFile), "clips.txt");
  await writeFile(list, clipFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  const args = ["-y", "-f", "concat", "-safe", "0", "-i", list, "-i", wavFile, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", outFile];
  await new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath!, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (error, _out, stderr) =>
      error ? reject(new Error(`Joining the reel failed: ${String(stderr).slice(-400)}`)) : resolve(),
    );
  });
}
