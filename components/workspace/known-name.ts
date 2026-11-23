import type { AgentSummary } from "@/components/agents/api";
import type { ContextDocsResponse } from "@/components/context/api";
import type { ContentItem } from "@/components/workspace/content-panels";
import { sharedResponse } from "@/components/workspace/use-job";
import type { View } from "@/lib/workspace-view";

/** A post from the calendar list the Overview already fetched (the shared cache; nothing new is polled), if it is in it. */
export const cachedPost = (base: string, id: string) => (sharedResponse(`${base}/content`) as { items?: ContentItem[] } | undefined)?.items?.find((i) => i.id === id);

/** The name of what `view` shows, from what the Overview already holds; undefined when not known (yet). */
export function knownName(view: View, from: { docs: ContextDocsResponse | null; agents: AgentSummary[] | null; base: string }): string | undefined {
  switch (view.kind) {
    case "doc":
      return from.docs?.docs.find((d) => d.kind === view.doc)?.title;
    case "agent":
      return from.agents?.find((a) => a.key === view.key)?.name;
    case "competitor":
      return (sharedResponse(`${from.base}/competitors`) as { competitors?: { id: string; name: string }[] } | undefined)?.competitors?.find((c) => c.id === view.id)?.name;
    case "content":
      return cachedPost(from.base, view.id)?.title;
    case "task": // the task peek puts each task it loads here (TaskView); until then, "Task"
      return (sharedResponse(`${from.base}/tasks/${encodeURIComponent(view.id)}`) as { task?: { title: string } } | undefined)?.task?.title;
    case "panel":
    case "home":
      return undefined;
  }
}
