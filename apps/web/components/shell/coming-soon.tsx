import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function ComingSoon({ icon, title, description }: Props) {
  return (
    <div className="mx-auto max-w-5xl">
      <EmptyState
        size="hero"
        icon={icon}
        eyebrow="Coming soon"
        headingLevel="h1"
        title={title}
        description={description}
      />
    </div>
  );
}
