import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export type JoinClip = { file: string; seconds: number };

/**
 * Scene clips → one reel, with the joined voiceover (only the voice is encoded, to AAC).
 * Clips from one model at their exact length are stream-copied (~0.2 s, little CPU). Mixed models (different
 * frame rates and sizes) or clips longer than their scene are re-encoded: trimmed, fitted to 1080×1920, 30 fps
 * (≈ 5–10 s CPU for 20 s of video).
 * ponytail: no burned-in subtitles (another re-encode pass); Instagram's automatic captions cover it for now.
 */
export async function joinReel(clips: JoinClip[], wavFile: string, outFile: string, opts: { reencode: boolean }): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg isn't available on this server");
  const tail = ["-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", outFile];
  let args: string[];
  if (!opts.reencode) {
    const list = path.join(path.dirname(outFile), "clips.txt");
    await writeFile(list, clips.map((c) => `file '${c.file.replace(/'/g, "'\\''")}'`).join("\n"));
    args = ["-y", "-f", "concat", "-safe", "0", "-i", list, "-i", wavFile, "-map", "0:v", "-map", "1:a", "-c:v", "copy", ...tail];
  } else {
    const fit = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1";
    const parts = clips.map((c, i) => `[${i}:v]trim=0:${c.seconds},setpts=PTS-STARTPTS,${fit}[v${i}]`);
    const filter = `${parts.join(";")};${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[v]`;
    args = ["-y", ...clips.flatMap((c) => ["-i", c.file]), "-i", wavFile, "-filter_complex", filter, "-map", "[v]", "-map", `${clips.length}:a`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...tail];
  }
  await new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath!, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (error, _out, stderr) =>
      error ? reject(new Error(`Joining the reel failed: ${String(stderr).slice(-400)}`)) : resolve(),
    );
  });
}
