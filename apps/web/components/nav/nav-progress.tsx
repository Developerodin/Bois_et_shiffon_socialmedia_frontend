"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar along the top while the next page loads, so every link answers the click at once. It starts on a
 * click on a link to another page of this site (or a GET form, e.g. search) and finishes when the URL changes.
 * ponytail: it can't see navigations started from code (router.push); those keep their own busy states. A link
 * whose page never arrives (an error) is cut off after 15 s.
 */
export function NavProgress() {
  const path = usePathname();
  const query = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    const start = (url: URL) => {
      if (url.origin !== location.origin || url.href === location.href) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // only the #hash changes
      setState("loading");
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && !a.target && !a.hasAttribute("download")) start(new URL(a.href));
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (e.defaultPrevented || form.method !== "get") return;
      const url = new URL(form.action);
      url.search = new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
      start(url);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  // The new URL is here: finish the bar, then hide it.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
  }, [path, query]);
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), state === "done" ? 400 : 15_000);
    return () => clearTimeout(t);
  }, [state]);

  return <div aria-hidden="true" data-state={state} className="nav-progress" />;
}
