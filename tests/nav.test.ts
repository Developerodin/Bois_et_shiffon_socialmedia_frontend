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
  it("keeps the SEO & GEO reports page over Surge", () => {
    expect(navFor("/performance").activeId).toBe("performance");
  });
  it("ignores the query string", () => {
    expect(navFor("/performance?x=1").title).toBe("SEO & GEO reports");
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

  it("adds Website and Performance to the main list behind the flag and tasks.read, and titles /tasks", () => {
    expect(ids(sidebarGroups(["tasks"], ["brand.read"])[0])).not.toContain("website");
    expect(ids(sidebarGroups(["tasks"], ["brand.read", "tasks.read"])[0]).slice(-2)).toEqual(["website", "seo"]);
    expect(sidebarGroups(["tasks"], ["tasks.read"]).flatMap(ids)).not.toContain("tasks");
    expect(NAV.find((e) => e.id === "tasks")?.group).not.toBe("more");
    expect(navFor("/tasks").title).toBe("Projects & tasks");
    expect(NAV.find((e) => e.id === "seo")).toMatchObject({ label: "Performance", href: "/tasks?area=seo&view=open" });
  });
  it("titles /projects and a project page Projects without listing it", () => {
    expect(navFor("/projects").title).toBe("Projects");
    expect(navFor("/projects/p1").title).toBe("Projects");
    expect(sidebarGroups(["tasks"], ["tasks.read"]).flatMap(ids)).not.toContain("projects");
  });
});

describe("agent slots", () => {
  const slot = (id: string, f: Parameters<typeof agentEntries>[0], p?: string[]) => agentEntries(f, p).find((e) => e.id === id);

  it("turns Pulse into the Sales tab only with the sales flag and crm.read", () => {
    expect(slot("pulse", ["sales"], ["crm.read"])).toMatchObject({ href: "/performance?tab=sales", role: "Finance", soon: false });
    expect(slot("pulse", ["sales"], ["brand.read"])).toMatchObject({ href: "/agents/pulse", soon: true });
    expect(slot("pulse", [], ["crm.read"])).toMatchObject({ href: "/agents/pulse", soon: true });
    // crm.manage opens /crm, not the Sales tab.
    expect(slot("pulse", ["sales"], ["crm.manage"])).toMatchObject({ href: "/agents/pulse", soon: true });
  });

  it("turns Hum into Settings' Members tab with members.read, no flag needed", () => {
    expect(slot("hum", [], ["members.read"])).toMatchObject({ href: "/settings?tab=members", role: "Admin & access", soon: false });
    expect(slot("hum", [], ["brand.read"])).toMatchObject({ href: "/agents/hum", soon: true });
  });

  it("keeps Echo coming soon: there is no web inbox page", () => {
    expect(slot("echo", ["inbox"], ["inbox.read"])).toMatchObject({ soon: true });
  });

  it("keeps the pages over the agents that point at them", () => {
    expect(navFor("/settings").activeId).toBe("settings");
    expect(navFor("/performance?tab=sales").activeId).toBe("performance");
  });
});
