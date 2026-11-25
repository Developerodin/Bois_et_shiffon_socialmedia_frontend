"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field with a show/hide button. `className` sizes and spaces the field as a whole (e.g. "mt-1.5 h-11");
 * the other props go to the input. The button names its action and reports its state (aria-pressed) for screen
 * readers; it is type="button" so it never submits the form. Hidden again on every mount.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  ({ className, ...props }, ref) => {
    const [shown, setShown] = React.useState(false);
    return (
      <div className={cn("relative", className)}>
        <Input ref={ref} type={shown ? "text" : "password"} className="h-full pr-11" {...props} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
