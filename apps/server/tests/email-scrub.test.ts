import { describe, expect, it } from "vitest";
import { scrubLinks } from "@/server/email/outbox";

describe("scrubLinks", () => {
  it("removes invite and reset links, keeps the rest", () => {
    const text = "Join here: https://app.example.com/invite/abc123XYZ\nReset: http://localhost:3100/reset-password?token=t0k.en\nHelp: https://example.com/help";
    expect(scrubLinks(text)).toBe("Join here: [link removed after sending]\nReset: [link removed after sending]\nHelp: https://example.com/help");
  });
});
