"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentType } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; icon?: ComponentType<{ className?: string }>; disabled?: boolean };

/**
 * A filter as a styled dropdown, in place of a native select (whose open list is the system's blue menu): a pill that
 * shows the current choice and opens a menu of the options, the chosen one ticked. The first option whose value is ""
 * means "any"; any other choice outlines the pill (ink text, the --control outline chosen tabs use) so the filters
 * that are on show at a glance. Radix gives it the keyboard: Enter, Space or the arrow keys open it, the arrows move,
 * Enter picks, Esc closes, and focus goes back to the pill. Its accessible name is the label and the current choice
 * ("Status: Any status"). `fill`: fill the row (the Filters popover) instead of sizing to the text.
 */
export function FilterSelect({ label, value, options, onChange, fill = false, disabled = false }: { label: string; value: string; options: readonly FilterOption[]; onChange: (value: string) => void; fill?: boolean; /** while a change is saving */ disabled?: boolean }) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const on = value !== "";
  const Icon = current?.icon;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`${label}: ${current?.label ?? ""}`}
        className={cn(
          "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border bg-card pl-3 pr-2 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted pointer-coarse:h-11 pointer-coarse:text-sm",
          on ? "border-control text-foreground ring-1 ring-inset ring-control" : "border-input text-muted-foreground",
          fill ? "w-full" : "max-w-56",
        )}
      >
        {Icon && <Icon aria-hidden className="size-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-left">{current?.label}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" aria-label={label} className="min-w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border-border bg-card p-1 shadow-md">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuPrimitive.RadioItem
              key={o.value}
              value={o.value}
              data-value={o.value}
              disabled={o.disabled}
              className="flex h-8 cursor-default select-none items-center gap-2 rounded-lg pl-2 pr-7 text-xs outline-none transition-colors relative data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[state=checked]:font-medium pointer-coarse:h-11 pointer-coarse:text-sm"
            >
              {o.icon && <o.icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="truncate">{o.label}</span>
              <DropdownMenuPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                <Check aria-hidden className="size-3.5" />
              </DropdownMenuPrimitive.ItemIndicator>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
