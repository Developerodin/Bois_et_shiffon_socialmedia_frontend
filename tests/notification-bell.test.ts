import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BellBadge, badgeLabel, notificationText } from "@/components/shell/notification-bell";
import { taskHref } from "@/lib/workspace-view";

describe("notification bell", () => {
  it("badge reads 99+ at the cap and hides at 0", () => {
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(99)).toBe("99");
    expect(badgeLabel(100)).toBe("99+");
    expect(renderToStaticMarkup(createElement(BellBadge, { count: 0 }))).toBe("");
    expect(renderToStaticMarkup(createElement(BellBadge, { count: 100 }))).toContain("99+");
  });

  it("says what happened as plain words", () => {
    const n = { id: "n1", brandId: "b1", taskId: "t1", taskTitle: "<b>Fix</b>", actor: { id: "u1", name: "Ana", gone: false, client: false }, readAt: null, createdAt: "2026-11-23T10:00:00.000Z" };
    expect(notificationText({ ...n, kind: "TASK_ASSIGNED" })).toBe("Ana assigned you a task");
    expect(notificationText({ ...n, kind: "REVIEW_REQUESTED" })).toBe("Ana asked you to review a task");
    expect(notificationText({ ...n, kind: "TASK_OVERDUE" })).toBe("A task of yours is overdue");
    expect(notificationText({ ...n, kind: "TASK_RECHECK", actor: null })).toBe("Time to recheck a task");
  });
});

describe("taskHref", () => {
  it("opens in this page's peek where there is one, else on /tasks", () => {
    expect(taskHref("/", "?panel=content&post=p1", "t1")).toBe("/?panel=content&task=t1");
    expect(taskHref("/tasks", "?area=seo", "t1")).toBe("/tasks?area=seo&task=t1");
    expect(taskHref("/projects/p1", "", "t1")).toBe("/projects/p1?task=t1");
    expect(taskHref("/library", "?x=1", "t1")).toBe("/tasks?task=t1");
  });
});
