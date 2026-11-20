import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("performance and admin readability", () => {
  const audit = read("components/performance/audit-board.tsx");
  it("audit findings show they expand", () => {
    expect(audit).toContain("ChevronRight");
    expect(audit).toContain("group-open:rotate-90");
  });
  it("severity and permission copy are plain words", () => {
    expect(audit).not.toContain("analytics.read");
    expect(audit).toContain("SEVERITY_LABEL[f.severity]");
    expect(audit).toContain('critical: "Critical"');
  });
  it("admin text is at least 12 px and AA contrast", () => {
    expect(read("components/admin/ui.tsx")).not.toContain("text-muted-foreground/60");
    expect(read("components/admin/spend-chart.tsx")).not.toContain("text-[10px]");
    expect(read("app/(shell)/admin/workspaces/[workspaceId]/roles/page.tsx")).not.toContain("text-[11px]");
  });
  it("the admin page names no developer commands or hover-only data", () => {
    const page = read("app/(shell)/admin/page.tsx");
    expect(page).not.toContain("Hover a day");
    expect(page).not.toContain("npm run");
  });
});
