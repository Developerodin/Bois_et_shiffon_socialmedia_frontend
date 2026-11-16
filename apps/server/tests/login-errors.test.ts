import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn(), getProviders: vi.fn(), getSession: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import { loginMessage } from "@/components/auth/login-form";

describe("loginMessage", () => {
  it("maps a rate-limited credentials failure", () => {
    expect(loginMessage({ error: "CredentialsSignin", code: "rate_limited" })).toBe("Too many sign-in attempts. Wait 15 minutes and try again.");
  });
  it("maps an unavailable result", () => {
    expect(loginMessage({ error: "CredentialsSignin", code: "unavailable" })).toBe("We couldn't check your sign-in just now. Try again in a moment.");
  });
  it("treats a credentials failure with no known code as a wrong password", () => {
    expect(loginMessage({ error: "CredentialsSignin" })).toBe("Email or password is incorrect.");
    expect(loginMessage({ error: "CredentialsSignin", code: "credentials" })).toBe("Email or password is incorrect.");
  });
  it("does not call a server fault a wrong password", () => {
    expect(loginMessage({ error: "Configuration", code: "unavailable" })).toBe("We couldn't check your sign-in just now. Try again in a moment.");
    expect(loginMessage({ error: "Configuration" })).toBe("We couldn't check your sign-in just now. Try again in a moment.");
  });
  it("returns null when there is no error", () => {
    expect(loginMessage({ error: null })).toBeNull();
  });
});
