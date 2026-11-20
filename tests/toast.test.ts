import { describe, expect, it } from "vitest";
import { clearActionToasts, clearToasts, currentToasts, runToastAction, safeHref, toast, toastMs } from "@/components/ui/toast";

describe("safeHref", () => {
  it("keeps in-app paths", () => {
    for (const h of ["/", "/agents", "/?agent=seo&runId=r1", "/posts?post=1"]) expect(safeHref(h)).toBe(h);
  });
  it("drops anything that could leave the app", () => {
    for (const h of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/a\nb", "/ x", "/.evil", "https://evil.com", "javascript:alert(1)", "evil", "", undefined]) expect(safeHref(h)).toBeUndefined();
  });
});

describe("toast store", () => {
  it("clearToasts removes every toast (the watcher calls it when a brand switch unmounts it)", () => {
    clearToasts();
    toast({ title: "A finished", tone: "success" });
    toast({ title: "B needs a look", tone: "warning" });
    expect(currentToasts()).toHaveLength(2);
    clearToasts();
    expect(currentToasts()).toHaveLength(0);
  });
});

describe("toast action", () => {
  it("pressing it runs the callback and dismisses the toast", () => {
    clearToasts();
    let ran = 0;
    toast({ title: "Content is collapsed", tone: "warning", action: { label: "Expand", onAction: () => ran++ } });
    runToastAction(currentToasts()[0].id);
    expect(ran).toBe(1);
    expect(currentToasts()).toHaveLength(0);
  });
  it("honours ms and defaults to 10 s", () => {
    expect(toastMs({ ms: 15_000 })).toBe(15_000);
    expect(toastMs({})).toBe(10_000);
  });
  it("clearActionToasts keeps toasts without a button", () => {
    clearToasts();
    toast({ title: "plain", tone: "success" });
    toast({ title: "with", tone: "warning", action: { label: "Go", onAction() {} } });
    clearActionToasts();
    expect(currentToasts().map((t) => t.title)).toEqual(["plain"]);
    clearToasts();
  });
});
