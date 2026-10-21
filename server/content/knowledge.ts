import { listContextDocs } from "@/server/services/context-docs";

/**
 * Brand knowledge for content agents: the confirmed version of each strategy doc, else the latest
 * draft clearly labelled as unconfirmed (the brief: outputs from unconfirmed context are marked).
 */
export async function brandKnowledge(workspaceId: string, brandId: string, maxPerDoc = 4000) {
  const docs = await listContextDocs(workspaceId, brandId);
  const unconfirmed = docs.filter((d) => !d.confirmed && d.latest).map((d) => d.title);
  const text = docs
    .map((d) => {
      const use = d.confirmed ?? d.latest;
      if (!use) return `## ${d.title}\n(not written yet)`;
      return `## ${d.title} ${d.confirmed ? "(confirmed by the team)" : "(DRAFT, not confirmed: treat as hypotheses)"}\n${use.markdown.slice(0, maxPerDoc)}`;
    })
    .join("\n\n");
  return { text, unconfirmed };
}
