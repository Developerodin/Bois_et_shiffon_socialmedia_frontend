/** Shared by the Overview's dividers (between columns, between panels in a column) and the side preview's edge. */

/** One arrow-key press moves this share of the two neighbours' total. */
export const KEY_STEP = 0.08;

/**
 * Moves `delta` from b to a, keeping each at least `min` and their total unchanged. A pair too short for two
 * minimums gets half each as its floor, so it still moves the right way and never goes negative.
 */
export function split(a: number, b: number, delta: number, min: number): [number, number] {
  const m = Math.min(min, (a + b) / 2);
  const na = Math.max(m, Math.min(a + b - m, a + delta));
  return [na, a + b - na];
}

/** -1, 1 or 0 for an arrow key along the axis (Left/Up back, Right/Down forward). */
export const arrow = (key: string, axis: "x" | "y") =>
  key === (axis === "x" ? "ArrowLeft" : "ArrowUp") ? -1 : key === (axis === "x" ? "ArrowRight" : "ArrowDown") ? 1 : 0;

/**
 * Follows a primary-button pointer drag on a handle: `onMove` gets how far (px) it has gone along the axis, `onEnd` runs
 * once when it ends. The handle captures the pointer, so the drag also ends on cancel or lost capture (a blur, alt-tab).
 * Handles need `touch-none` so a touch drag isn't taken for a scroll.
 */
export function drag(
  e: { button: number; pointerId: number; clientX: number; clientY: number; currentTarget: Element; preventDefault: () => void },
  axis: "x" | "y",
  onMove: (px: number) => void,
  onEnd: () => void,
) {
  if (e.button !== 0) return;
  e.preventDefault();
  const el = e.currentTarget;
  const start = axis === "x" ? e.clientX : e.clientY;
  // No button held any more (released outside the window while capture stayed): finish the drag.
  const move = (ev: PointerEvent) => (ev.buttons ? onMove((axis === "x" ? ev.clientX : ev.clientY) - start) : end());
  const end = () => {
    el.removeEventListener("pointermove", move as EventListener);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.removeEventListener(t, end);
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    onEnd();
  };
  el.setPointerCapture(e.pointerId);
  el.addEventListener("pointermove", move as EventListener);
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(t, end);
}
