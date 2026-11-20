import { afterEach, describe, expect, it, vi } from "vitest";
import { guardsAttached, okToDiscard, registerUnsaved, setUnsaved } from "@/components/context/unsaved";

const confirm = vi.fn(() => false);
const listeners = { add: vi.fn(), remove: vi.fn() };
vi.stubGlobal("window", { confirm, addEventListener: listeners.add, removeEventListener: listeners.remove });
vi.stubGlobal("document", { addEventListener: listeners.add, removeEventListener: listeners.remove });

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

  it("unmounting one editor leaves the other's warning and the guards in place", () => {
    const offA = registerUnsaved(a);
    const offB = registerUnsaved(b);
    expect(guardsAttached()).toBe(true);
    offA();
    expect(guardsAttached()).toBe(true);
    expect(okToDiscard()).toBe(false);
    offB();
    expect(guardsAttached()).toBe(false);
    expect(okToDiscard()).toBe(true);
  });

  it("attaches the guards once for two editors and removes them once", () => {
    listeners.add.mockClear();
    listeners.remove.mockClear();
    const offA = registerUnsaved(a);
    const offB = registerUnsaved(b);
    expect(listeners.add).toHaveBeenCalledTimes(2); // beforeunload + click, once each
    offA();
    offB();
    expect(listeners.remove).toHaveBeenCalledTimes(2);
  });
});
