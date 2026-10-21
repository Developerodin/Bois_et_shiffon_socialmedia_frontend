/**
 * AT-017 — `X-Workspace-Id` must match path workspace id.
 * @see docs/ADVERSARIAL_ACCEPTANCE_TESTS.md
 */
import { describe, expect, it } from "vitest";
import { assertWorkspaceHeaderMatchesPath } from "@/server/api/workspace-headers";
import { AccessDeniedError } from "@/server/auth/errors";

describe("AT-017 workspace header guard", () => {
  it("allows when header is absent", () => {
    expect(() =>
      assertWorkspaceHeaderMatchesPath("ws-path", null),
    ).not.toThrow();
  });

  it("allows when header matches path", () => {
    expect(() =>
      assertWorkspaceHeaderMatchesPath("ws-path", "ws-path"),
    ).not.toThrow();
  });

  it("denies when header differs from path", () => {
    expect(() =>
      assertWorkspaceHeaderMatchesPath("ws-path", "ws-other"),
    ).toThrow(AccessDeniedError);
  });
});
