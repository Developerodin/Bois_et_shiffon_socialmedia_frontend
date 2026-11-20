/** Shared by the Overview's dividers (between columns, between panels in a column) and the side preview's edge. */

/** One arrow-key press moves this share of the two neighbours' total. */
export const KEY_STEP = 0.08;

/** Moves `delta` from b to a, keeping each at least `min` and their total unchanged. */
export function split(a: number, b: number, delta: number, min: number): [number, number] {
  const na = Math.max(min, Math.min(a + b - min, a + delta));
  return [na, a + b - na];
}

/** -1, 1 or 0 for an arrow key along the axis (Left/Up back, Right/Down forward). */
export const arrow = (key: string, axis: "x" | "y") =>
  key === (axis === "x" ? "ArrowLeft" : "ArrowUp") ? -1 : key === (axis === "x" ? "ArrowRight" : "ArrowDown") ? 1 : 0;

/** Follows a pointer drag: `onMove` gets how far (px) it has gone along the axis, `onEnd` runs once on release. */
export function drag(e: { clientX: number; clientY: number; preventDefault: () => void }, axis: "x" | "y", onMove: (px: number) => void, onEnd: () => void) {
  e.preventDefault();
  const start = axis === "x" ? e.clientX : e.clientY;
  const move = (ev: PointerEvent) => onMove((axis === "x" ? ev.clientX : ev.clientY) - start);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onEnd();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
