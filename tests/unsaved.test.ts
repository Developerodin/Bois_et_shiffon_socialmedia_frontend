import { afterEach, describe, expect, it, vi } from "vitest";
import { okToDiscard, setUnsaved } from "@/components/context/unsaved";

const confirm = vi.fn(() => false);
vi.stubGlobal("window", { confirm });

const a = Symbol("caption");
const b = Symbol("release");

afterEach(() => {
  setUnsaved(a, false);
  setUnsaved(b, false);
  confirm.mockClear();
});

describe("unsaved changes, per editor", () => {
  it("doesn't ask when nothing is dirty", () => {
    expect(okToDiscard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("still asks when one of two dirty owners clears", () => {
    setUnsaved(a, true);
    setUnsaved(b, true);
    setUnsaved(a, false);
    expect(okToDiscard()).toBe(false);
    expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Leave without saving?");
  });

  it("doesn't ask once both clear, and clearing twice is harmless", () => {
    setUnsaved(a, true);
    setUnsaved(b, true);
    setUnsaved(a, false);
    setUnsaved(b, false);
    setUnsaved(b, false);
    expect(okToDiscard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("returns true when the person agrees to discard", () => {
    confirm.mockReturnValueOnce(true);
    setUnsaved(a, true);
    expect(okToDiscard()).toBe(true);
  });
});
