import { Newspaper } from "lucide-react";
import { BlogBoard } from "@/components/blog/blog-board";
import { featureAccess } from "@/components/shell/feature-access";
import { PageHeader } from "@/components/ui/page-header";
import { navFor } from "@/lib/nav";
import { getShell } from "@/lib/server-fetch";

export const metadata = { title: navFor("/blog").title };

/** Blog articles (flag `blog`): written here, sent to the Shopify blog hidden, published when a person says so. `?task=` starts one from a task. */
export default async function BlogRoute({ searchParams }: { searchParams: Promise<{ task?: string | string[] }> }) {
  const access = await featureAccess({
    feature: "blog",
    path: "/blog",
    icon: Newspaper,
    noBusiness: "Articles belong to a business. Create or pick one from the sidebar, then its blog shows here.",
    noRead: "Your role cannot see this business's blog. Ask a workspace admin for access.",
  });
  if (access.gate) return access.gate;
  const shell = await getShell(); // cached: featureAccess read it already
  const task = (await searchParams).task;
  // The page holds the header here; Quotes' board holds its own because its New quote button needs the board's state.
  // Blog has no header action: a new article starts from the topic form in the list (or the empty state).
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <PageHeader title="Blog">Articles for the store&rsquo;s blog. Approved ones go to Shopify hidden; nobody sees them there until you press Publish.</PageHeader>
      <BlogBoard key={access.brandId} w={access.workspaceId} b={access.brandId} perms={shell.brandPermissions} taskId={typeof task === "string" && task.length <= 40 ? task : null} />
    </div>
  );
}
