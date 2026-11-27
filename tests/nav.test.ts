import { describe, expect, it } from "vitest";
import { NAV, activeIdFor, agentEntries, navFor, sidebarGroups } from "@/lib/nav";

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
  it("keeps the Growth reports page over Surge", () => {
    expect(navFor("/performance").activeId).toBe("performance");
  });
  it("ignores the query string", () => {
    expect(navFor("/performance?x=1").title).toBe("Growth reports");
  });
  it("titles Social & Content over Wave, which links to it, and keeps More's entry on the Content calendar", () => {
    expect(NAV.find((e) => e.id === "wave")?.href).toBe("/social");
    expect(NAV.find((e) => e.id === "social")).toMatchObject({ href: "/social", group: "page", perm: ["brand.read"] });
    expect(navFor("/social")).toMatchObject({ activeId: "social", title: "Social & Content", brandScoped: true });
    expect(NAV.find((e) => e.id === "calendar")).toMatchObject({ href: "/calendar", group: "more", perm: ["brand.read"] });
    expect(navFor("/calendar")).toMatchObject({ activeId: "calendar", title: "Content calendar", brandScoped: true });
  });
  it("titles the Competitors page over Drift, which links to it", () => {
    expect(NAV.find((e) => e.id === "drift")?.href).toBe("/competitors");
    expect(navFor("/competitors")).toMatchObject({ activeId: "competitors", title: "Competitors", brandScoped: true });
  });
  it("declares that the Competitors page needs brand.read", () => {
    expect(NAV.find((e) => e.id === "competitors")?.perm).toEqual(["brand.read"]);
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
    expect(NAV.find((e) => e.id === "seo")).toMatchObject({ label: "Performance tasks", href: "/tasks?area=seo&view=open" });
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

  it("turns Spark into /crm with the crm flag and either crm.manage or inbox.read", () => {
    expect(slot("spark", ["crm"], ["crm.manage"])).toMatchObject({ href: "/crm", soon: false });
    expect(slot("spark", ["crm"], ["inbox.read"])).toMatchObject({ href: "/crm", soon: false });
    expect(slot("spark", ["crm"], ["brand.read"])).toMatchObject({ href: "/agents/spark", soon: true });
  });

  it("turns Hum into Settings' Members tab with members.read in the workspace, no flag needed", () => {
    const hum = (perms: string[] | undefined, workspacePerms: string[] | undefined) =>
      agentEntries([], perms, workspacePerms).find((e) => e.id === "hum");
    expect(hum(["brand.read"], ["members.read"])).toMatchObject({ href: "/settings?tab=members", role: "Admin & access", soon: false });
    // No business picked: no business permissions, but the workspace's members.read still opens Members.
    expect(hum([], ["members.read"])).toMatchObject({ href: "/settings?tab=members", soon: false });
    expect(hum(["members.read"], ["brand.read"])).toMatchObject({ href: "/agents/hum", soon: true });
    expect(hum(undefined, undefined)).toMatchObject({ href: "/settings?tab=members", soon: false });
  });

  it("keeps Echo coming soon: there is no web inbox page", () => {
    expect(slot("echo", ["inbox"], ["inbox.read"])).toMatchObject({ soon: true });
  });

  it("resolves /settings and /performance to their pages in navFor, ignoring the tab query", () => {
    expect(navFor("/settings").activeId).toBe("settings");
    expect(navFor("/performance?tab=sales").activeId).toBe("performance");
  });
});

describe("activeIdFor", () => {
  const ALL_FLAGS = ["tasks", "crm", "sales", "inbox"] as const;
  const ALL_PERMS = ["tasks.read", "crm.manage", "crm.read", "inbox.read", "members.read"];
  const at = (href: string, live: ReadonlySet<string>) => {
    const u = new URL(href, "http://x");
    return activeIdFor(u.pathname, u.searchParams, live);
  };

  it("selects every live agent that points at a page, a tab or a panel on its own href", () => {
    const entries = agentEntries([...ALL_FLAGS], ALL_PERMS, ALL_PERMS);
    const live = new Set(entries.filter((e) => !e.soon).map((e) => e.id));
    const pointing = entries.filter((e) => !e.soon && !e.href.startsWith("/agents/"));
    expect(pointing.map((e) => e.id).sort()).toEqual(["beat", "drift", "hum", "pulse", "spark", "surge", "wave"]);
    for (const e of pointing) expect(at(e.href, live), e.href).toBe(e.id);
  });

  it("selects Wave on the Content calendar page, and no longer on the Overview's old ?panel=content", () => {
    expect(at("/calendar", new Set())).toBe("wave");
    expect(at("/calendar?post=p1&cf_need=week", new Set())).toBe("wave");
    expect(at("/social", new Set())).toBe("wave");
    expect(at("/calendar?cf_channel=meta", new Set())).toBe("wave");
    expect(at("/?panel=content", new Set())).toBe("overview");
  });

  it("selects Drift on the Competitors page, and no longer on the Overview's old ?panel=competitors", () => {
    expect(at("/competitors", new Set())).toBe("drift");
    expect(at("/?panel=competitors", new Set())).toBe("overview");
  });

  it("falls back to the page while Pulse or Hum is not live", () => {
    expect(at("/performance?tab=sales", new Set())).toBe("surge");
    expect(at("/settings?tab=members", new Set())).toBe("settings");
  });
});
