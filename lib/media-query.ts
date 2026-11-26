import { useCallback, useSyncExternalStore } from "react";

/** Tailwind's lg breakpoint: the panel board (components/workspace/panel-layout.tsx); below it, one panel at a time. */
export const LG = "(min-width: 1024px)";
/** Tailwind's xl breakpoint: the docked sidebar and the docked assistant column. */
export const XL = "(min-width: 1280px)";

/**
 * Whether a media query matches, kept up to date. Server and first paint assume it matches: the wide layouts are the
 * ones CSS hides on a narrow screen until the check runs.
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}

/** 1024 px or wider. */
export const useLg = () => useMediaQuery(LG);
/** 1280 px or wider. */
export const useXl = () => useMediaQuery(XL);
