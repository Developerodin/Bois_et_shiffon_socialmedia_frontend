import { describe, expect, it } from "vitest";
import { readable } from "@/lib/agent-message";

describe("agent messages", () => {
  it("keeps actionable text from raw provider errors", () => {
    expect(readable('Attempt failed: AiProviderError: OpenAI 429: { "error": { "type": "insufficient_quota" } }')).toMatch(/run out of credits/);
    expect(readable('Attempt failed: OpenAI 500: { "error": "boom" }')).toBe("Attempt failed: OpenAI 500…");
    expect(readable("Read 8 page(s)")).toBe("Read 8 page(s)");
  });
});
