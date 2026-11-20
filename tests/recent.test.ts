import { safeHref } from "@/components/ui/toast";
import { viewToSearch } from "@/lib/workspace-view";
import { describe, expect, it } from "vitest";
import { clearAllRecent, entryToView, isReopenKey, pushRecent, readRecent, recentKey, writeRecent, RECENT_MAX, type RKey, type RecentEntry } from "@/lib/recent";

const NOW = 1_800_000_000_000;
const day = 24 * 3600 * 1000;
const e = (id: string, at = NOW): RecentEntry => ({ kind: "post", id, at });

function fakeStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

describe("recent list", () => {
  it("puts the newest first, dedupes by kind and id, and caps", () => {
    let l: RecentEntry[] = [];
    for (let i = 0; i < 10; i++) l = pushRecent(l, e(`p${i}`, NOW + i));
    expect(l).toHaveLength(RECENT_MAX);
    expect(l[0].id).toBe("p9");
    l = pushRecent(l, e("p5", NOW + 99));
    expect(l.filter((x) => x.id === "p5")).toHaveLength(1);
    expect(l[0].id).toBe("p5");
    // same id, other kind, is another item
    expect(pushRecent([e("x")], { kind: "competitor", id: "x", at: NOW })).toHaveLength(2);
  });

  it("builds the key only with a user id", () => {
    expect(recentKey("w", "b", undefined)).toBeNull();
    expect(recentKey("w", "b", "u")).toBe("recent:w:b:u");
  });

  it("reads strictly: rebuilt entries, no extra fields, bad kinds, ids and ages dropped", () => {
    const raw = [
      { kind: "agent", id: "planner", at: NOW, run: true },
      { kind: "bogus", id: "x", at: NOW },
      { kind: "post", id: "bad id!", at: NOW },
      { kind: "doc", id: "nope", at: NOW },
      { kind: "post", id: "old", at: NOW - 31 * day },
      { kind: "post", id: "nan", at: "now" },
      null,
      "str",
      { kind: "post", id: "ok", at: NOW - day },
    ];
    const l = readRecent("k", NOW, fakeStore({ k: JSON.stringify(raw) }));
    expect(l).toEqual([
      { kind: "agent", id: "planner", at: NOW },
      { kind: "post", id: "ok", at: NOW - day },
    ]);
    expect("run" in l[0]).toBe(false);
  });

  it("reads at most 8 and survives garbage", () => {
    const many = Array.from({ length: 12 }, (_, i) => e(`p${i}`));
    expect(readRecent("k", NOW, fakeStore({ k: JSON.stringify(many) }))).toHaveLength(8);
    expect(readRecent("k", NOW, fakeStore({ k: "{oops" }))).toEqual([]);
    expect(readRecent("k", NOW, fakeStore({ k: JSON.stringify({ a: 1 }) }))).toEqual([]);
    expect(readRecent("k", NOW, null)).toEqual([]);
  });

  it("skips a write when the top entry is the same item", () => {
    const s = fakeStore();
    writeRecent("k", e("a", NOW), NOW, s);
    const first = s.getItem("k");
    writeRecent("k", e("a", NOW + 5000), NOW + 5000, s);
    expect(s.getItem("k")).toBe(first);
    writeRecent("k", e("b", NOW + 6000), NOW + 6000, s);
    expect(readRecent("k", NOW + 6000, s).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("opens an entry from kind and id only", () => {
    expect(entryToView({ kind: "agent", id: "planner", ...({ run: true } as object) } as RecentEntry)).toEqual({ kind: "agent", key: "planner" });
    expect(entryToView({ kind: "post", id: "abc" })).toEqual({ kind: "content", id: "abc" });
    expect(entryToView({ kind: "doc", id: "nope" })).toEqual({ kind: "home" });
  });

  it("clears only recent: keys", () => {
    const s = fakeStore({ "recent:w:b:u": "[]", "recent:w:b:v": "[]", "ws.layout.v1": "{}", other: "1" });
    clearAllRecent(s);
    expect(s.keys().sort()).toEqual(["other", "ws.layout.v1"]);
  });
});

describe("R key", () => {
  const base: RKey = { key: "r", defaultPrevented: false, repeat: false, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, inBlockedTarget: false };
  it("accepts a plain r or R", () => {
    expect(isReopenKey(base)).toBe(true);
    expect(isReopenKey({ ...base, key: "R" })).toBe(true);
  });
  it("rejects other keys, modifiers, repeats, composing, handled and blocked targets", () => {
    for (const o of [{ key: "x" }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }, { defaultPrevented: true }, { inBlockedTarget: true }]) {
      expect(isReopenKey({ ...base, ...o })).toBe(false);
    }
  });
});

describe("Reopen link", () => {
  it("is an in-app path naming only the item", () => {
    const href = `/${viewToSearch(entryToView({ kind: "agent", id: "planner" }), "", "/")}`;
    expect(href).toBe("/?agent=planner");
    expect(safeHref(href)).toBe(href);
    expect(`/${viewToSearch(entryToView({ kind: "post", id: "abc" }), "", "/")}`).toBe("/?post=abc");
  });
});
