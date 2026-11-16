import { execFile } from "node:child_process";
import ffprobe from "ffprobe-static";

export type VideoMeta = { durationSec: number; width: number; height: number; fps: number; videoStreams: number; audioStreams: number };

type Stream = {
  codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; duration?: string;
  side_data_list?: { rotation?: number }[]; tags?: { rotate?: string };
};

/** A quarter turn (phone clips shot upright carry rotation metadata) swaps the shown width and height. */
const quarterTurn = (s?: Stream) => {
  const r = Number(s?.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ?? s?.tags?.rotate ?? 0);
  return Math.abs(r) % 180 === 90;
};

const rate = (r?: string) => {
  const [n, d] = (r ?? "").split("/").map(Number);
  return n > 0 && d > 0 ? n / d : 0;
};

/**
 * Read what ffprobe measured. Duration comes from the container's own field (format.duration, else the video
 * stream's), never from the free-text tags a file can carry.
 */
export function parseProbeJson(json: string): VideoMeta {
  const j = JSON.parse(json) as { streams?: Stream[]; format?: { duration?: string } };
  if (!Array.isArray(j.streams) || !j.format) throw new Error("Not ffprobe output");
  const video = j.streams.filter((s) => s.codec_type === "video");
  const first = video[0];
  const durationSec = Number(j.format.duration ?? first?.duration);
  const [w, h] = [first?.width ?? 0, first?.height ?? 0];
  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    // As shown (ffmpeg auto-rotates on decode), so crops and checks see the upright size.
    width: quarterTurn(first) ? h : w,
    height: quarterTurn(first) ? w : h,
    fps: first ? rate(first.avg_frame_rate) || rate(first.r_frame_rate) : 0,
    videoStreams: video.length,
    audioStreams: j.streams.filter((s) => s.codec_type === "audio").length,
  };
}

/** ffprobe on a local file: file protocol only, container forced to mov/mp4 so a playlist or other format is never followed. */
export const probeVideo = (file: string) =>
  new Promise<VideoMeta>((resolve, reject) => {
    execFile(
      ffprobe.path,
      ["-v", "error", "-protocol_whitelist", "file", "-f", "mov", "-show_streams", "-show_format", "-of", "json", file],
      { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(new Error("That clip couldn't be read."));
        try {
          resolve(parseProbeJson(String(stdout)));
        } catch (e) {
          reject(e);
        }
      },
    );
  });

/** The first limit a clip breaks (Global Constraints), or null. */
export function videoProblem(m: VideoMeta): { code: string; message: string } | null {
  if (m.videoStreams !== 1) return { code: "story.videoStreams", message: "The clip needs exactly one video track." };
  if (m.audioStreams > 1) return { code: "story.videoStreams", message: "The clip can have at most one audio track." };
  if (!(m.durationSec > 0)) return { code: "story.videoUnreadable", message: "That clip couldn't be read." };
  if (m.durationSec > 180) return { code: "story.videoLong", message: "Clips can be up to 3 minutes." };
  if (Math.max(m.width, m.height) > 4096) return { code: "story.videoLarge", message: "The clip is bigger than 4096 pixels on a side." };
  if (Math.min(m.width, m.height) < 240) return { code: "story.videoShape", message: "The clip is too small or too narrow (at least 240 pixels on each side)." };
  if (m.fps > 60) return { code: "story.videoFps", message: "The clip runs faster than 60 frames per second." };
  return null;
}
