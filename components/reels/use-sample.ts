"use client";

import { useSyncExternalStore } from "react";
import { sampleAction } from "./reel";

// One Audio for the whole page, so a sample in the script row, the Voices sheet or anywhere else stops the last one.
let audio: HTMLAudioElement | null = null;
let current: string | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function stop() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  current = null;
  emit();
}

function ended() {
  if (current === null) return;
  current = null;
  emit();
}

function toggle(id: string, url: string) {
  const action = sampleAction(current, id, url);
  if (action === "stop") return stop();
  if (action === "refuse") return;
  if (!audio) {
    audio = new Audio();
    audio.addEventListener("ended", ended);
    audio.addEventListener("error", ended);
  }
  audio.src = url;
  current = id;
  emit();
  audio.play().catch(() => { if (current === id) ended(); });
}

// The last subscriber leaving (the page closing) stops the sound.
function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
    if (subs.size === 0) stop();
  };
}

/** The id of the sample playing, and the controls: a new id stops the old one; only https: or blob: links play. */
export function useSample(): { playing: string | null; toggle: (id: string, url: string) => void; stop: () => void } {
  const playing = useSyncExternalStore(subscribe, () => current, () => null);
  return { playing, toggle, stop };
}
