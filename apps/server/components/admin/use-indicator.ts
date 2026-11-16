"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A highlight that slides to the current item (`[aria-current]` inside the container) instead of jumping: the tab
 * underline, the sidebar pill, the filter pill. Placed without animation the first time, then it moves with the
 * .slide-indicator transition (globals.css; off under prefers-reduced-motion). Re-measured when the shown item
 * changes and when the container resizes (items move when a row wraps).
 * `shape`: "underline" = a 2 px bar under the item; "box" = the item's whole box.
 *
 * The next page can take a second to arrive, and until then a click looked like it did nothing. `pick(key)` is the
 * item's onClick: the item it's given is shown as current at once (`shown`), until the page's own `current` arrives.
 */
export function useIndicator<T extends HTMLElement>(current: string, shape: "underline" | "box") {
  const ref = useRef<T>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });
  const placed = useRef(false);
  const [picked, setPicked] = useState<string | null>(null);
  // A pick lasts until the page's own value changes (the page arrived, or back/forward moved it).
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setPicked(null);
  }
  const shown = picked ?? current;

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
  }, [shown, shape]);

  // Opening in a new tab (modifier keys, middle click) leaves this page as it is.
  const pick = (key: string) => (e: React.MouseEvent) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) setPicked(key);
  };

  return { ref, style, shown, pick };
}
