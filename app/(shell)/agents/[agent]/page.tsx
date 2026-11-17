import { notFound, redirect } from "next/navigation";
import { Bot } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";
import type { Metadata } from "next";
import { NAV } from "@/lib/nav";

export async function generateMetadata({ params }: { params: Promise<{ agent: string }> }): Promise<Metadata> {
  const { agent } = await params;
  return { title: NAV.find((e) => e.group === "agent" && e.id === agent)?.label ?? "Page not found" };
}

/** An agent's page. Agents with a Phase 1 destination go there; the rest say they are coming. */
export default async function AgentPage({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  const entry = NAV.find((e) => e.group === "agent" && e.id === agent);
  if (!entry) notFound();
  if (!entry.href.startsWith("/agents/")) redirect(entry.href);

  return (
    <ComingSoon
      icon={Bot}
      mark={`/agents/${entry.id}.svg`}
      title={entry.label}
      description={`${entry.role} agent. ${entry.blurb ?? "It is not on the web yet, and arrives in a later release."}`}
      backHref="/"
      backLabel="Back to Overview"
    />
  );
}
