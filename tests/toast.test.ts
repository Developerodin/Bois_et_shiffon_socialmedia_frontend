import { describe, expect, it } from "vitest";
import { clearToasts, currentToasts, safeHref, toast } from "@/components/ui/toast";

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
