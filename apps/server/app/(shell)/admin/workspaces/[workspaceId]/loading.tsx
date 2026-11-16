import { PageSkeleton } from "@/components/ui/page-skeleton";

/** Inside the workspace layout: its header and tabs stay put while a tab loads. */
export default function Loading() {
  return <PageSkeleton header={false} />;
}
