"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A highlight that slides to the current item (`[aria-current]` inside the container) instead of jumping: the tab
 * underline, the sidebar pill, the filter pill. Placed without animation the first time, then it moves with the
 * .slide-indicator transition (globals.css; off under prefers-reduced-motion). Re-measured when `current` changes
 * and when the container resizes (items move when a row wraps).
 * `shape`: "underline" = a 2 px bar under the item; "box" = the item's whole box.
 */
export function useIndicator<T extends HTMLElement>(current: string, shape: "underline" | "box") {
  const ref = useRef<T>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const placed = useRef(false);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const place = () => {
      const on = box.querySelector<HTMLElement>("[aria-current]");
      if (!on) return setStyle({ opacity: 0 });
      const y = shape === "underline" ? on.offsetTop + on.offsetHeight - 2 : on.offsetTop;
      setStyle({
        opacity: 1,
        width: on.offsetWidth,
        height: shape === "underline" ? 2 : on.offsetHeight,
        transform: `translate(${on.offsetLeft}px, ${y}px)`,
        transition: placed.current ? undefined : "none",
      });
      placed.current = true;
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(box);
    return () => watch.disconnect();
  }, [current, shape]);

  return { ref, style };
}
