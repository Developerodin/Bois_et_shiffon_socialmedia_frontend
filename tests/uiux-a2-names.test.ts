import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV } from "@/lib/nav";
import { peekCrumb } from "@/lib/workspace-view";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
const byId = (id: string) => NAV.find((e) => e.id === id)!;

describe("one name per agent and page", () => {
  it("names the calendar Content calendar everywhere", () => {
    expect(byId("calendar").label).toBe("Content calendar");
    expect(byId("wave").role).toBe("Content calendar");
    expect(peekCrumb({ kind: "content", id: "p1" })).toBe("Content calendar › Post");
  });
  it("gives the built agents the role name the Overview shows", () => {
    expect(byId("drift").role).toBe("Competitors");
    expect(byId("surge").role).toBe("SEO & GEO reports");
  });
  it("keeps Echo pointing at Connections", () => {
    expect(byId("echo").href).toBe("/settings?tab=connections");
  });
  it("never says Scout in visible copy", () => {
    expect(read("components/workspace/workspace.tsx")).not.toContain("Scout reads");
  });
});
