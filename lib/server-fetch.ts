import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ShellResponse } from "@espanda/shared";

/** Build an API path: every interpolated value is URL-encoded, so an id can never add a path segment or a query. */
export function api(strings: TemplateStringsArray, ...values: (string | number)[]) {
  return strings.reduce((path, part, i) => path + encodeURIComponent(String(values[i - 1])) + part);
}

/**
 * Call the Server API from a server component, as the signed-in person (their cookie is forwarded).
 * 401 sends them to sign in again; 403/404 show the not-found page; anything else non-2xx reaches the error page.
 * The 401 redirect carries the page being viewed (x-pathname, set in middleware) so sign-in returns there.
 */
export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.SERVER_URL ?? "http://localhost:3100";
  const cookie = (await cookies()).toString();
  const res = await fetch(base + path, {
    ...init,
    cache: "no-store",
    headers: { ...(cookie ? { cookie } : {}), ...init?.headers },
  });
  if (res.status === 401) {
    const here = (await headers()).get("x-pathname");
    // Same-site paths only ("//host" would be an open redirect).
    const next = here && here.startsWith("/") && !here.startsWith("//") ? `&next=${encodeURIComponent(here)}` : "";
    redirect(`/login?expired=1${next}`);
  }
  if (res.status === 403 || res.status === 404) notFound();
  if (!res.ok) throw new Error(`server ${res.status}`);
  return (await res.json()) as T;
}

/** The shell data, fetched once per request however many layouts and pages ask. */
export const getShell = cache(() => serverFetch<ShellResponse>(api`/api/v1/me/shell`));
