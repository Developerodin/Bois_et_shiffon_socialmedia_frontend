import { describe, expect, it } from "vitest";
import { NAV, navFor } from "@/lib/nav";

describe("NAV", () => {
  it("lists the agents in order", () => {
    expect(NAV.filter((e) => e.group === "agent").map((e) => e.id)).toEqual([
      "spark", "beat", "wave", "echo", "pulse", "hum", "surge", "drift",
    ]);
  });

  it("marks exactly the unbuilt agents as soon", () => {
    const soon = NAV.filter((e) => e.group === "agent" && e.soon).map((e) => e.id);
    expect(soon).toEqual(["spark", "beat", "echo", "pulse", "hum"]);
  });

  it("carries no Figma sample content", () => {
    for (const e of NAV) {
      expect(`${e.label} ${e.blurb ?? ""}`).not.toMatch(/Bois|Bunting|Priyanshu/);
    }
  });
});

describe("navFor", () => {
  it("matches the overview exactly", () => {
    expect(navFor("/")).toMatchObject({ activeId: "overview", title: "Overview", brandScoped: true });
  });
  it("matches a top-level page", () => {
    expect(navFor("/context")).toMatchObject({ activeId: "context", title: "Business context" });
  });
  it("resolves the agent log and a single agent", () => {
    expect(navFor("/agents")).toMatchObject({ title: "Agent log" });
    expect(navFor("/agents/spark")).toMatchObject({ activeId: "spark", title: "Spark" });
  });
  it("resolves deep admin paths to Admin, not brand scoped", () => {
    expect(navFor("/admin/people/abc")).toEqual({ activeId: "admin", title: "Admin", brandScoped: false });
  });
  it("does not call an unknown agent the Agent log", () => {
    expect(navFor("/agents/nope")).toEqual({ activeId: null, title: "Page not found", brandScoped: true });
  });
  it("falls back to Overview for unknown paths", () => {
    expect(navFor("/totally/unknown")).toEqual({ activeId: null, title: "Overview", brandScoped: true });
  });
  it("keeps the Performance page over Surge", () => {
    expect(navFor("/performance").activeId).toBe("performance");
  });
  it("ignores the query string", () => {
    expect(navFor("/performance?x=1").title).toBe("Performance");
  });
});
