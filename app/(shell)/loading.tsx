import { PageSkeleton } from "@/components/ui/page-skeleton";

/** Every app page: shown the moment you click, until the page arrives (and lets Next prefetch up to here). */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageSkeleton />
    </div>
  );
}
