import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

type Props = {
  icon: LucideIcon;
  slice: number;
  title: string;
  description: string;
};

export function ComingSoon({ icon, slice, title, description }: Props) {
  return (
    <div className="mx-auto max-w-5xl">
      <EmptyState
        size="hero"
        icon={icon}
        eyebrow={`Coming in Slice ${slice}`}
        title={title}
        description={description}
      />
    </div>
  );
}
