/**
 * The admin console shows each person's permissions; they must be exactly what the app enforces. Compares
 * workspaceDetail() with effectivePermissions() for every member of every workspace, on the workspace and on each
 * project. Read-only (reads the database named in .env).
 * Run: npm run check:platform-admin -w web
 */
import assert from "node:assert/strict";
import { effectivePermissions } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";
import { workspaceDetail } from "@/server/services/platform-admin";

(async () => {
  let compared = 0;
  for (const { id } of await prisma.workspace.findMany({ select: { id: true } })) {
    const detail = (await workspaceDetail(id))!;
    for (const m of detail.members) {
      const shown = (keys: { key: string }[]) => keys.map((p) => p.key).sort();
      assert.deepEqual(shown(m.workspacePermissions), [...(await effectivePermissions(id, m.user.id))].sort(), `${m.user.email} in workspace ${detail.workspace.name}`);
      compared++;
      for (const p of m.projects) {
        assert.deepEqual(shown(p.effective), [...(await effectivePermissions(id, m.user.id, p.brandId))].sort(), `${m.user.email} on ${p.brand}`);
        compared++;
      }
    }
  }
  console.log(`✓ the console's permissions match the app's for ${compared} member/workspace and member/project pairs`);
})().finally(() => prisma.$disconnect());
