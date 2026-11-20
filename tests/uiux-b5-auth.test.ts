import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("auth screens", () => {
  it("the sign-in notice uses the readable success ink", () => {
    const s = read("components/auth/login-form.tsx");
    expect(s).toContain("text-success-ink");
    expect(s).not.toMatch(/text-success"/);
  });
  it("account pages share sign-in's card radius and 44 px fields", () => {
    const card = read("components/auth/auth-card.tsx");
    expect(card).toContain("rounded-2xl");
    expect(card).not.toContain('className="mt-1"');
    for (const f of ["app/forgot-password/page.tsx", "app/invite/[token]/accept-invite.tsx"]) {
      expect(read(f)).not.toContain('className="mt-1"');
    }
  });
});
