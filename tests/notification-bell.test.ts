import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BellBadge, badgeLabel, groupView, notificationTarget, notificationText } from "@/components/shell/notification-bell";
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
    const n = { id: "n1", count: 1, brandId: "b1", taskId: "t1", taskTitle: "<b>Fix</b>", actor: { id: "u1", name: "Ana", gone: false, client: false }, alert: null, readAt: null, createdAt: "2026-11-23T10:00:00.000Z" };
    expect(notificationText({ ...n, kind: "TASK_ASSIGNED" })).toBe("Ana assigned you a task");
    expect(notificationText({ ...n, kind: "REVIEW_REQUESTED" })).toBe("Ana asked you to review a task");
    expect(notificationText({ ...n, kind: "TASK_OVERDUE" })).toBe("A task of yours is overdue");
    expect(notificationText({ ...n, kind: "TASK_RECHECK", actor: null })).toBe("Time to recheck a task");
    expect(notificationText({ ...n, kind: "TASK_APPROVED" })).toBe("Ana approved your task");
    expect(notificationText({ ...n, kind: "TASK_CHANGES_REQUESTED" })).toBe("Ana asked for changes to your task");
    expect(notificationText({ ...n, kind: "TASK_OVERDUE", count: 3 })).toBe("3 of your tasks are overdue");
    expect(notificationText({ ...n, kind: "REVIEW_REQUESTED", count: 2 })).toBe("2 tasks waiting for your review");
    expect(groupView("REVIEW_REQUESTED")).toBe("approvals");
    expect(groupView("TASK_OVERDUE")).toBe("overdue");
    expect(groupView("TASK_ASSIGNED")).toBe("mine");
  });

  const alert = { id: "n2", kind: "AD_ALERT", count: 1, brandId: "b2", taskId: null, taskTitle: null, actor: null, readAt: null, createdAt: "2026-11-23T10:00:00.000Z" };

  it("an ads alert reads as its server text, as text: markup stays literal", () => {
    const text = '<img src=x onerror=alert(1)> Campaign "Spring" spent 46.10 EUR';
    const n = { ...alert, alert: { kind: "NO_PURCHASES" as const, text } };
    expect(notificationText(n)).toBe(text);
    expect(notificationText({ ...n, alert: null })).toBe("Ads alert");
    expect(notificationText({ ...n, count: 3 })).toBe("3 ads alerts");
    // React escapes it like any text child.
    expect(renderToStaticMarkup(createElement("span", null, notificationText(n)))).toContain("&lt;img");
  });

  it("a search traffic alert opens its page's history, or the Search tab, only with the data flag", () => {
    const seo = { ...alert, kind: "SEO_ALERT", alert: { kind: "CLICKS_DOWN" as const, text: "2 pages losing search traffic, e.g. /a", seoUrl: "https://shop.test/a b" } };
    expect(notificationText(seo)).toBe("2 pages losing search traffic, e.g. /a");
    expect(notificationText({ ...seo, count: 3 })).toBe("3 search traffic alerts");
    expect(notificationTarget(seo)).toBeNull();
    expect(notificationTarget(seo, { data: true })).toBe("/performance/url?u=https%3A%2F%2Fshop.test%2Fa%20b");
    expect(notificationTarget({ ...seo, count: 2 }, { data: true })).toBe("/performance?tab=search");
    expect(notificationTarget({ ...seo, alert: { kind: "SITE_DOWN", text: "x" } }, { data: true })).toBe("/performance?tab=search");
  });

  it("an ads alert opens the Ads tab, one or a group, with no task; a task notice its task or list", () => {
    expect(notificationTarget({ ...alert, alert: { kind: "SPEND_UP", text: "x" } })).toBe("/performance?tab=ads");
    expect(notificationTarget({ ...alert, count: 2, alert: null })).toBe("/performance?tab=ads");
    const task = { ...alert, kind: "TASK_ASSIGNED", taskId: "t 1", alert: null };
    expect(notificationTarget(task)).toBe("/tasks?task=t%201");
    expect(notificationTarget({ ...task, count: 2 })).toBe("/tasks?view=mine");
    expect(notificationTarget({ ...task, taskId: null })).toBeNull();
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
