"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_KEY } from "@/components/theme/theme-script";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

/** The theme showing now: a choice on <html> (.light / .dark), else the system setting (globals.css does the same). */
function current(): Theme {
  const html = document.documentElement;
  if (html.classList.contains("light")) return "light";
  if (html.classList.contains("dark")) return "dark";
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(t: Theme) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

/**
 * Light / dark switch. The new theme spreads out in a circle from the button (View Transitions API); browsers
 * without it get a short colour fade; reduced motion switches at once. The choice is remembered on this device.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null); // unknown until mounted (the server can't know)
  useEffect(() => setTheme(current()), []);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next: Theme = current() === "dark" ? "light" : "dark";
    const done = () => {
      apply(next);
      setTheme(next);
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
    if (!doc.startViewTransition) {
      // Fallback: colours ease over 300 ms (the .theme-fade rules in globals.css), then the class comes off.
      document.documentElement.classList.add("theme-fade");
      done();
      setTimeout(() => document.documentElement.classList.remove("theme-fade"), 320);
      return;
    }
    // Circle reveal from the button's centre to the farthest corner.
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = doc.startViewTransition(done);
    t.ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    );
  }

  const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9",
        className,
      )}
    >
      {/* Both icons drawn; the showing one turns in as the theme flips. */}
      <Sun aria-hidden="true" className={cn("absolute size-4 transition-all duration-300 motion-reduce:transition-none", theme === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")} />
      <Moon aria-hidden="true" className={cn("absolute size-4 transition-all duration-300 motion-reduce:transition-none", theme === "light" ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")} />
    </button>
  );
}
