import { describe, expect, it } from "vitest";
import { arrow, KEY_STEP, split } from "@/components/workspace/resize";
import { clampPeekWidth, PEEK_WIDTH, peekMax } from "@/components/workspace/use-peek";

describe("moving size between two neighbours", () => {
  it("moves the delta from one to the other and keeps the total", () => {
    const [a, b] = split(1, 1, 0.5, 0.3);
    expect(a).toBe(1.5);
    expect(a + b).toBe(2);
  });

  it("never takes either below the minimum", () => {
    expect(split(1, 1, 5, 0.3)[1]).toBeCloseTo(0.3);
    expect(split(1, 1, -5, 0.3)).toEqual([0.3, 1.7]);
    const [a, b] = split(2, 0.5, 3, 0.4);
    expect(b).toBeCloseTo(0.4);
    expect(a + b).toBeCloseTo(2.5);
  });

  it("a pair shorter than two minimums floors at half each: moves the right way, never negative", () => {
    // 0.5 total, min 0.3 (under 2 x min): growing a stops at half, shrinking a too.
    const [a, b] = split(0.2, 0.3, 1, 0.3);
    expect(a).toBeCloseTo(0.25);
    expect(b).toBeCloseTo(0.25);
    expect(split(0.2, 0.3, -1, 0.3)[0]).toBeCloseTo(0.25);
    // a already under the minimum: a push the right way grows it, never past half.
    expect(split(0.1, 0.4, 0.05, 0.3)[0]).toBeCloseTo(0.25);
    // Total under one minimum: still never negative.
    const [c, d] = split(0.1, 0.1, -5, 0.3);
    expect(c).toBeGreaterThan(0);
    expect(d).toBeGreaterThan(0);
    expect(c + d).toBeCloseTo(0.2);
  });

  it("an arrow key moves one step of the pair's total, in the axis's direction", () => {
    expect(arrow("ArrowLeft", "x")).toBe(-1);
    expect(arrow("ArrowRight", "x")).toBe(1);
    expect(arrow("ArrowUp", "y")).toBe(-1);
    expect(arrow("ArrowDown", "y")).toBe(1);
    expect(arrow("ArrowUp", "x")).toBe(0);
    expect(arrow("Enter", "y")).toBe(0);
    const [a, b] = split(1, 1, arrow("ArrowDown", "y") * KEY_STEP * 2, 0.3);
    expect(a).toBeCloseTo(1.16);
    expect(a + b).toBeCloseTo(2);
  });
});

describe("side preview width", () => {
  it("clamps between 400 px and the smaller of 1000 px and 75% of the viewport", () => {
    expect(clampPeekWidth(560, 1600)).toBe(560);
    expect(clampPeekWidth(100, 1600)).toBe(400);
    expect(clampPeekWidth(5000, 2000)).toBe(1000);
    expect(clampPeekWidth(1000, 1200)).toBe(900);
  });

  it("its cap follows the viewport", () => {
    expect(peekMax(1200)).toBe(900);
    expect(peekMax(2000)).toBe(1000);
  });

  it("falls back to the default for a bad saved value", () => {
    expect(clampPeekWidth(Number("abc"), 1600)).toBe(PEEK_WIDTH);
  });
});
