import { describe, expect, it } from "vitest";
import { NAV, navFor, sidebarGroups } from "@/lib/nav";

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

describe("sidebarGroups", () => {
  const ids = (g: { entries: { id: string }[] }) => g.entries.map((e) => e.id);

  it("shows only the main list with no flags", () => {
    const g = sidebarGroups([]);
    expect(g.map((x) => x.id)).toEqual(["main"]);
    expect(g[0].label).toBeNull();
    expect(ids(g[0])).toEqual(["overview", "context", "products", "connections"]);
  });

  it("adds Create when one of its features is on", () => {
    const g = sidebarGroups(["reels"]);
    expect(g.map((x) => x.id)).toEqual(["main", "create"]);
    expect(g[1].label).toBe("Create");
    expect(ids(g[1])).toEqual(["reels"]);
  });

  it("adds Customers and Automations", () => {
    const g = sidebarGroups(["inbox", "automations"]);
    expect(g.map((x) => x.id)).toEqual(["main", "customers"]);
    expect(ids(g[0]).at(-1)).toBe("automations");
    expect(g[1].label).toBe("Customers");
    expect(ids(g[1])).toEqual(["inbox"]);
  });

  it("leaves out Connections and Inbox for a role without inbox.read (a client reviewer)", () => {
    const g = sidebarGroups(["inbox"], ["brand.read", "analytics.read", "content.approve", "content.download"]);
    expect(g.map((x) => x.id)).toEqual(["main"]);
    expect(ids(g[0])).toEqual(["overview", "context", "products"]);
    expect(ids(sidebarGroups(["inbox"], ["brand.read", "inbox.read"])[1])).toEqual(["inbox"]);
  });

  it("gates Studio on stories", () => {
    expect(ids(sidebarGroups(["stories"])[1])).toEqual(["studio"]);
  });

  it("flags every Create and Customers entry", () => {
    for (const e of NAV.filter((x) => x.group === "create" || x.group === "customers")) {
      expect(e.feature).toBeDefined();
    }
  });
});

describe("navFor, coming routes", () => {
  it("names the new routes", () => {
    expect(navFor("/studio").title).toBe("Studio");
    expect(navFor("/reels/abc")).toMatchObject({ activeId: "reels", title: "Reels" });
    expect(navFor("/inbox").title).toBe("Inbox");
    expect(navFor("/library").title).toBe("Brand & photos");
    expect(navFor("/photoshoot").title).toBe("Photoshoot");
    expect(navFor("/automations").title).toBe("Automations");
  });
});
