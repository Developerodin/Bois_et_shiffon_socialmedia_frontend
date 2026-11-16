import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { Transition } from "@/server/reels/router";

/** transition: how this clip hands over to the next (the last clip's is ignored). */
export type JoinClip = { file: string; seconds: number; transition?: Transition };

/** A dissolve's length. The video loses it at each dissolve, so the last frame is held that much longer (voice stays in sync). */
export const DISSOLVE_SECONDS = 0.4;

/** ffmpeg with these arguments (also used for recorded voiceovers, recordings.ts). */
export const run = (args: string[], timeout: number) =>
  new Promise<void>((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg isn't available on this server"));
    execFile(ffmpegPath, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, _out, stderr) =>
      error ? reject(new Error(`ffmpeg failed: ${String(stderr).slice(-400)}`)) : resolve(),
    );
  });

/**
 * The re-encode filter: each clip trimmed to its scene and fitted to 1080×1920 at 30 fps, then joined in order, with
 * a crossfade where a clip's transition is "dissolve" and a straight cut otherwise. Exported for tests.
 */
export function videoFilter(clips: Pick<JoinClip, "seconds" | "transition">[]): string {
  const fit = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p,settb=AVTB";
  const steps = clips.map((c, i) => `[${i}:v]trim=0:${c.seconds},setpts=PTS-STARTPTS,${fit}[v${i}]`);
  let joined = "v0";
  let length = clips[0].seconds;
  let dissolves = 0;
  for (let i = 1; i < clips.length; i++) {
    const out = `j${i}`;
    if (clips[i - 1].transition === "dissolve") {
      steps.push(`[${joined}][v${i}]xfade=transition=fade:duration=${DISSOLVE_SECONDS}:offset=${(length - DISSOLVE_SECONDS).toFixed(3)}[${out}]`);
      length += clips[i].seconds - DISSOLVE_SECONDS;
      dissolves++;
    } else {
      steps.push(`[${joined}][v${i}]concat=n=2:v=1:a=0[${out}]`);
      length += clips[i].seconds;
    }
    joined = out;
  }
  steps.push(dissolves ? `[${joined}]tpad=stop_mode=clone:stop_duration=${(dissolves * DISSOLVE_SECONDS).toFixed(3)}[v]` : `[${joined}]null[v]`);
  return steps.join(";");
}

/**
 * Scene clips → one reel, with the joined voiceover (only the voice is encoded, to AAC).
 * Clips from one model at their exact length, joined by plain cuts, are stream-copied (~0.2 s, little CPU). Mixed
 * models (different frame rates and sizes), clips longer than their scene, or any dissolve are re-encoded
 * (≈ 5–10 s CPU for 20 s of video).
 * ponytail: no burned-in subtitles (another re-encode pass); Instagram's automatic captions cover it for now.
 */
/** mark: a PNG laid over the bottom-right corner (the "Made with AI" mark); it forces a re-encode. */
export async function joinReel(clips: JoinClip[], wavFile: string, outFile: string, opts: { reencode: boolean; mark?: string }): Promise<void> {
  const tail = ["-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", outFile];
  let args: string[];
  if (opts.mark) {
    // Inputs: clips, the voice, then the mark. Kept above Instagram's caption area at the bottom.
    const filter = `${videoFilter(clips)};[${clips.length + 1}:v]format=rgba[m];[v][m]overlay=W-w-32:H-h-360[vm]`;
    args = ["-y", ...clips.flatMap((c) => ["-i", c.file]), "-i", wavFile, "-i", opts.mark, "-filter_complex", filter, "-map", "[vm]", "-map", `${clips.length}:a`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...tail];
  } else if (!opts.reencode) {
    const list = path.join(path.dirname(outFile), "clips.txt");
    await writeFile(list, clips.map((c) => `file '${c.file.replace(/'/g, "'\\''")}'`).join("\n"));
    args = ["-y", "-f", "concat", "-safe", "0", "-i", list, "-i", wavFile, "-map", "0:v", "-map", "1:a", "-c:v", "copy", ...tail];
  } else {
    args = ["-y", ...clips.flatMap((c) => ["-i", c.file]), "-i", wavFile, "-filter_complex", videoFilter(clips), "-map", "[v]", "-map", `${clips.length}:a`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...tail];
  }
  await run(args, 120_000).catch((e: Error) => {
    throw new Error(`Joining the reel failed: ${e.message}`);
  });
}

/** One frame of a clip as a small JPEG (the seam check compares the end of one scene with the start of the next). */
export async function frameOf(file: string, which: "first" | "last", outFile: string): Promise<void> {
  const seek = which === "last" ? ["-sseof", "-0.2"] : [];
  await run(["-y", ...seek, "-i", file, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", outFile], 30_000);
}
