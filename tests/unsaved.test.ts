import { afterEach, describe, expect, it, vi } from "vitest";
import { okToDiscard, registerUnsaved, setUnsaved } from "@/components/context/unsaved";

const confirm = vi.fn(() => false);
const listeners = { add: vi.fn(), remove: vi.fn() };
// A tiny event target, so a test can dispatch beforeunload and see whether the guard answers.
const handlers = new Map<string, (e: unknown) => void>();
const target = {
  addEventListener: (type: string, fn: unknown, ...rest: unknown[]) => (listeners.add(type, fn, ...rest), handlers.set(type, fn as (e: unknown) => void)),
  removeEventListener: (type: string, fn: unknown, ...rest: unknown[]) => (listeners.remove(type, fn, ...rest), handlers.delete(type)),
};
vi.stubGlobal("window", { confirm, ...target });
vi.stubGlobal("document", target);
// True when closing the tab would warn: dispatches beforeunload through whatever the code attached.
const guardsAttached = () => {
  const e = { preventDefault: vi.fn() };
  handlers.get("beforeunload")?.(e);
  return e.preventDefault.mock.calls.length > 0;
};

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
