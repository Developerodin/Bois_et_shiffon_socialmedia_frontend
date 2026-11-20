import { describe, expect, it } from "vitest";
import { undoRoleChange } from "@/components/settings/role-undo";

describe("undoRoleChange", () => {
  it("re-sends the old role for a member that now holds the new one", () => {
    const before = { id: "m1", role: { id: "editor", name: "Editor" } };
    const undo = undoRoleChange(before, "admin");
    expect(undo.roleId).toBe("editor");
    expect(undo.member.role.id).toBe("admin");
    expect(undo.member.id).toBe("m1");
    expect(undo.member.role.id).not.toBe(undo.roleId); // so changeRole's "unchanged" guard lets it through
  });
  it("does not mutate the original member", () => {
    const before = { role: { id: "a" } };
    undoRoleChange(before, "b");
    expect(before.role.id).toBe("a");
  });
});
