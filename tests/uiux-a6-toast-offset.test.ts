import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("toasts clear the Overview's phone tab bar", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "components/ui/toast.tsx"), "utf8");
  expect(src).toContain("max-lg:pb-[max(4.5rem,env(safe-area-inset-bottom))]");
});
