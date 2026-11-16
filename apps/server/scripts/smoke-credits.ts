/**
 * Manual agent runs cost credits: new workspace starts at 20, each run takes 5, the 5th is refused,
 * a failed run is refunded, and UNLIMITED_CREDIT_WORKSPACES never runs out. Throwaway workspace.
 * Run: npm run smoke:credits -w web
 */
import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import { AgentStartError, onAgentRunFailure, startAgentRun } from "@/server/agents/engine";
import { creditBalance } from "@/server/services/credits";

async function main() {
  const ws = await prisma.workspace.create({ data: { name: "Smoke credits", slug: `smoke-credits-${Date.now()}` } });
  try {
    // Different agents so in-flight dedupe doesn't merge the runs.
    const keys = ["seo", "geo", "brief", "planner"];
    const brand = await prisma.brand.create({ data: { workspaceId: ws.id, slug: "b", displayName: "Smoke", profile: { create: { websiteUrl: "https://example.com" } } } });
    const runs = [];
    for (const agentKey of keys) runs.push(await startAgentRun({ workspaceId: ws.id, brandId: brand.id, agentKey, trigger: "manual" }));
    assert.equal(await creditBalance(ws.id), 0);
    await assert.rejects(startAgentRun({ workspaceId: ws.id, brandId: brand.id, agentKey: "creator", trigger: "manual" }), (e) => e instanceof AgentStartError && e.status === 402);
    console.log("1 starts at 20, 4 runs × 5, 5th refused (402) ✓");

    await startAgentRun({ workspaceId: ws.id, brandId: brand.id, agentKey: "seo", trigger: "event" });
    assert.equal(await creditBalance(ws.id), 0, "event runs are free");
    console.log("2 event runs are free ✓");

    await onAgentRunFailure({ workspaceId: ws.id, brandId: brand.id, runId: runs[0].id }, new Error("boom"), true);
    assert.equal(await creditBalance(ws.id), 5);
    console.log("3 failed run refunded ✓");

    process.env.UNLIMITED_CREDIT_WORKSPACES = ws.id;
    await startAgentRun({ workspaceId: ws.id, brandId: brand.id, agentKey: "creator", trigger: "manual" });
    await startAgentRun({ workspaceId: ws.id, brandId: brand.id, agentKey: "quality", trigger: "manual" });
    assert.equal(await creditBalance(ws.id), 5, "unlimited spends nothing");
    console.log("4 unlimited workspace never charged ✓");
  } finally {
    await prisma.workspace.delete({ where: { id: ws.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
