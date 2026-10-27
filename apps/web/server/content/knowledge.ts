import { listContextDocs } from "@/server/services/context-docs";

/**
 * Brand knowledge for content agents: the latest version of each strategy doc, draft or confirmed.
 * Confirming is an optional "reviewed" mark; it never gates what agents read.
 */
export async function brandKnowledge(workspaceId: string, brandId: string, maxPerDoc = 4000) {
  const docs = await listContextDocs(workspaceId, brandId);
  const text = docs
    .map((d) => (d.latest ? `## ${d.title}\n${d.latest.markdown.slice(0, maxPerDoc)}` : `## ${d.title}\n(not written yet)`))
    .join("\n\n");
  return { text };
}
