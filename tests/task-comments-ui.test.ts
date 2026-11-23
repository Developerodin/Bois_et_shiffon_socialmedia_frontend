import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { shareToggleShown, TaskComments } from "@/components/tasks/task-comments";

const render = (staff: boolean, clientVisible: boolean) => renderToStaticMarkup(createElement(TaskComments, { base: "/api/x", taskId: "t1", staff, clientVisible }));

describe("task comments", () => {
  it("share toggle shown only to staff on a client-visible task", () => {
    expect(render(true, true)).toContain("Share with client");
    expect(render(true, false)).not.toContain("Share with client");
    expect(render(false, true)).not.toContain("Share with client");
    expect(render(false, false)).not.toContain("Share with client");
    expect(shareToggleShown({ staff: true, clientVisible: true })).toBe(true);
    expect(shareToggleShown({ staff: true, clientVisible: false })).toBe(false);
    expect(shareToggleShown({ staff: false, clientVisible: true })).toBe(false);
  });
  it("always offers a box to write a comment", () => {
    expect(render(false, false)).toContain("Add a comment");
  });
});
