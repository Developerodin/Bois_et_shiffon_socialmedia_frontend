"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A form's submit button that shows it's working: spinner and `pendingLabel` while the form's server action runs,
 * and disabled so a second press can't send it twice. A slight press-down on click.
 */
export function PendingButton({ children, pendingLabel, variant, className }: { children: React.ReactNode; pendingLabel: string; variant?: "outline"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending} className={cn("transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100", className)}>
      {pending ? (
        <>
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
