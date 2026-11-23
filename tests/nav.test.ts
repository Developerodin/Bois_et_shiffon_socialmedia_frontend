import { describe, expect, it } from "vitest";
import { NAV, agentEntries, navFor, sidebarGroups } from "@/lib/nav";

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

const ids = (g: { entries: { id: string }[] }) => g.entries.map((e) => e.id);

describe("sidebarGroups", () => {
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
    expect(ids(g[0])).toEqual(["overview", "products"]);
    expect(ids(sidebarGroups(["inbox"], ["brand.read", "inbox.read"])[1])).toEqual(["inbox"]);
    // Publishers pick their account and account managers manage them: either one sees Connections, not the Inbox.
    for (const key of ["publish.execute", "integrations.manage"]) {
      const g = sidebarGroups(["inbox"], ["brand.read", key]);
      expect(ids(g[0])).toContain("connections");
      expect(g.map((x) => x.id)).toEqual(["main"]);
    }
  });

  it("shows Business context only to roles that read agents", () => {
    expect(ids(sidebarGroups([], ["brand.read"])[0])).not.toContain("context");
    expect(ids(sidebarGroups([], ["brand.read", "agents.read"])[0])).toContain("context");
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

describe("tasks nav", () => {
  it("turns the Beat slot into Projects & tasks only with the flag and tasks.read", () => {
    const beat = (f: Parameters<typeof agentEntries>[0], p?: string[]) => agentEntries(f, p).find((e) => e.id === "beat");
    expect(beat([])).toMatchObject({ href: "/agents/beat", soon: true });
    expect(beat(["tasks"], ["brand.read"])).toMatchObject({ href: "/agents/beat", soon: true });
    expect(beat(["tasks"], ["tasks.read"])).toMatchObject({ href: "/tasks", role: "Projects & tasks", soon: false });
  });

  it("adds Projects & tasks, Website and SEO to the main list behind the flag and tasks.read", () => {
    expect(ids(sidebarGroups(["tasks"], ["brand.read"])[0])).not.toContain("website");
    expect(ids(sidebarGroups(["tasks"], ["brand.read", "tasks.read"])[0]).slice(-3)).toEqual(["tasks", "website", "seo"]);
    expect(navFor("/tasks").title).toBe("Projects & tasks");
  });
});
