import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/library", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { currentNavigation, finishNavigation, linkTarget, startNavigation } from "@/components/nav/nav-progress";
import { Sidebar } from "@/components/shell/sidebar";

const here = new URL("http://app.test/library?x=1");
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const link = (href: string, attrs: { target?: string; download?: boolean } = {}) => ({
  href: new URL(href, here).href,
  target: attrs.target ?? "",
  hasAttribute: (n: string) => n === "download" && !!attrs.download,
});

describe("linkTarget", () => {
  it("starts on a plain click on another page of this site", () => {
    expect(linkTarget(click, link("/products"), here)).toBe("/products");
    expect(linkTarget(click, link("/library?x=2"), here)).toBe("/library?x=2");
    expect(linkTarget(click, link("/tasks", { target: "_self" }), here)).toBe("/tasks");
  });
  it("ignores other sites, new tabs, downloads, modifier keys, other buttons, the same page and #hash links", () => {
    expect(linkTarget(click, link("https://example.com/products"), here)).toBeNull();
    expect(linkTarget(click, link("/products", { target: "_blank" }), here)).toBeNull();
    expect(linkTarget(click, link("/file.csv", { download: true }), here)).toBeNull();
    for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) expect(linkTarget({ ...click, [k]: true }, link("/products"), here)).toBeNull();
    expect(linkTarget({ ...click, button: 1 }, link("/products"), here)).toBeNull();
    expect(linkTarget(click, link("/library?x=1"), here)).toBeNull();
    expect(linkTarget(click, link("#content"), here)).toBeNull();
    expect(linkTarget(click, null, here)).toBeNull();
  });
});

describe("navigation progress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("loads until the new page arrives, then fills and hides", () => {
    startNavigation("/products");
    expect(currentNavigation()).toEqual({ state: "loading", href: "/products" });
    finishNavigation(); // NavProgress calls this when the pathname or query changes
    expect(currentNavigation().state).toBe("done");
    vi.advanceTimersByTime(400);
    expect(currentNavigation().state).toBe("idle");
  });

  it("finishing with nothing in flight does nothing (first render, a page you were already on)", () => {
    finishNavigation();
    expect(currentNavigation().state).toBe("idle");
  });

  it("gives up after 15 s when the page never arrives", () => {
    startNavigation("/products");
    vi.advanceTimersByTime(14_999);
    expect(currentNavigation().state).toBe("loading");
    vi.advanceTimersByTime(1);
    expect(currentNavigation()).toEqual({ state: "idle", href: null });
  });
});

describe("sidebar while a page loads", () => {
  const props = {
    brands: [],
    workspaces: [],
    activeWorkspaceId: "w1",
    activeBrandId: null,
    canCreateBrand: false,
    platformAdmin: false,
    features: [],
    perms: ["products.read"],
    workspacePerms: [],
    user: { name: "Ana" },
  };
  const navLink = (html: string, label: string) => html.match(/<a [^>]*>(?:(?!<\/a>).)*<\/a>/g)?.find((a) => a.endsWith(`${label}</a>`)) ?? "";
  afterEach(() => finishNavigation());

  it("marks the clicked item at once, keeps aria-current on the page you are on", () => {
    nav.pathname = "/";
    const before = renderToStaticMarkup(createElement(Sidebar, props));
    expect(navLink(before, "Overview")).toContain("bg-primary");

    startNavigation("/products");
    const html = renderToStaticMarkup(createElement(Sidebar, props));
    const overview = navLink(html, "Overview");
    const products = navLink(html, "Products");
    expect(products).toContain("bg-primary");
    expect(products).not.toContain("aria-current");
    expect(overview).not.toContain("bg-primary");
    expect(overview).toContain('aria-current="page"');
  });

  it("does the same for an agent", () => {
    nav.pathname = "/";
    startNavigation("/performance");
    const surge = renderToStaticMarkup(createElement(Sidebar, props)).match(/<a [^>]*href="\/performance"[^>]*>/)?.[0] ?? "";
    expect(surge).toContain("bg-accent");
    expect(surge).not.toContain("aria-current");
  });
});
