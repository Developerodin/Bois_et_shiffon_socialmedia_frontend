import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  eyebrow?: string;
  size?: "default" | "hero";
  className?: string;
  /** h1 when the empty state is the whole page. */
  headingLevel?: "h1" | "h2";
  /** Leave out the icon tile when the page shows its own artwork. */
  hideIcon?: boolean;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  eyebrow,
  size = "default",
  className,
  headingLevel: Heading = "h2",
  hideIcon = false,
}: Props) {
  const hero = size === "hero";
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border",
        hero ? "surface-glow px-8 py-16 sm:px-12 sm:py-24" : "px-6 py-10",
        className,
      )}
    >
      {hideIcon ? null : (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full border border-border bg-muted text-primary",
            hero ? "size-12" : "size-10",
          )}
          aria-hidden="true"
        >
          <Icon className={hero ? "size-5" : "size-4"} />
        </span>
      )}
      {eyebrow ? (
        <p className="text-xs font-medium text-primary">
          {eyebrow}
        </p>
      ) : null}
      <Heading
        className={cn(
          "font-display font-medium tracking-tight text-foreground text-balance",
          hero ? "max-w-2xl text-4xl sm:text-5xl" : "text-xl",
        )}
      >
        {title}
      </Heading>
      <p
        className={cn(
          "max-w-xl text-muted-foreground text-pretty",
          hero ? "text-base sm:text-lg" : "text-sm",
        )}
      >
        {description}
      </p>
    </div>
  );
}
