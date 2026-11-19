import { describe, expect, it } from "vitest";
import { NAV } from "@/lib/nav";
import { CHAT_PAGES } from "@/shared";

// The chat's page list (shared with the server) must name real nav pages with the labels people see.
describe("CHAT_PAGES", () => {
  it("is a nav id with its nav label, for every entry", () => {
    for (const [id, label] of Object.entries(CHAT_PAGES)) expect(NAV.find((n) => n.id === id)?.label).toBe(label);
  });
});
