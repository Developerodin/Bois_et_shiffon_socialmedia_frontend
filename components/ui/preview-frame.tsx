import type { ReactNode } from "react";

/**
 * A 9:16 frame for a reel: the photo, the on-screen text as real text over it, and a video only when there is one.
 * Below `md` the width is capped at 60vh * 9/16 so the frame stays 9:16 and is at most 60vh tall; from `md` up it fills the width up to `max-w-sm`. The video has native controls and never autoplays.
 * `children` sit over the frame (for example a status chip).
 */
export function PreviewFrame({ photoUrl, videoUrl, alt, onScreenText, children }: { photoUrl?: string; videoUrl?: string; alt: string; onScreenText?: string; children?: ReactNode }) {
  return (
    <div className="relative mx-auto aspect-[9/16] w-[min(100%,calc(60vh*9/16))] max-w-sm overflow-hidden rounded-2xl border border-border bg-muted shadow-sm md:w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, as in the library grid */}
      {photoUrl ? <img src={photoUrl} alt={alt} className="absolute inset-0 h-full w-full object-cover" /> : null}
      {videoUrl ? <video src={videoUrl} poster={photoUrl} controls playsInline preload="metadata" aria-label={alt} className="absolute inset-0 h-full w-full object-cover" /> : null}
      {onScreenText ? (
        <p className={`pointer-events-none absolute inset-x-3 ${videoUrl ? "bottom-16" : "bottom-6"} rounded-xl bg-black/55 px-3 py-2 text-center text-base font-semibold text-white`}>{onScreenText}</p>
      ) : null}
      {children}
    </div>
  );
}
