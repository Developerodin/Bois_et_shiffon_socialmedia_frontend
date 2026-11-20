import { describe, expect, it } from "vitest";
import { connectReturnPath } from "@/lib/connect-return";

describe("connectReturnPath", () => {
  it("returns the Connections page only for that exact value", () => {
    expect(connectReturnPath("/connections")).toBe("/connections");
  });
  it("falls back to staying put for anything else", () => {
    expect(connectReturnPath(null)).toBeNull();
    expect(connectReturnPath("")).toBeNull();
    expect(connectReturnPath("//evil")).toBeNull();
    expect(connectReturnPath("https://evil.example")).toBeNull();
    expect(connectReturnPath("/settings")).toBeNull();
    expect(connectReturnPath("/connections/../x")).toBeNull();
  });
});
