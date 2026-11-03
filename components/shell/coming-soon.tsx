import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SHELL_STROKE } from "@/components/shell/icon";
import { EmptyState } from "@/components/ui/empty-state";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Artwork shown above the title instead of the icon tile (an agent's mark). */
  mark?: string;
  backHref?: string;
  backLabel?: string;
};

export function ComingSoon({ icon, title, description, mark, backHref, backLabel }: Props) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" strokeWidth={SHELL_STROKE} aria-hidden="true" />
          {backLabel ?? "Back"}
        </Link>
      ) : null}
      {mark ? <Image src={mark} alt="" width={48} height={48} className="size-12" /> : null}
      <EmptyState
        size="hero"
        icon={icon}
        headingLevel="h1"
        title={title}
        description={description}
        hideIcon={Boolean(mark)}
      />
    </div>
  );
}
