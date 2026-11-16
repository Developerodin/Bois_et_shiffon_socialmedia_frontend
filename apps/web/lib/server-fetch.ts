import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ShellResponse } from "@espanda/shared";

/** Build an API path: every interpolated value is URL-encoded, so an id can never add a path segment or a query. */
export function api(strings: TemplateStringsArray, ...values: (string | number)[]) {
  return strings.reduce((path, part, i) => path + encodeURIComponent(String(values[i - 1])) + part);
}

/**
 * Call the Server API from a server component, as the signed-in person (their cookie is forwarded).
 * 401 sends them to sign in again; 403/404 show the not-found page; anything else non-2xx reaches the error page.
 * ponytail: the 401 redirect doesn't carry the page being viewed (middleware already bounces signed-out visits
 * with it); thread the path through if that bounce ever stops covering this.
 */
export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.SERVER_URL ?? "http://localhost:3100";
  const cookie = (await cookies()).toString();
  const res = await fetch(base + path, {
    ...init,
    cache: "no-store",
    headers: { ...(cookie ? { cookie } : {}), ...init?.headers },
  });
  if (res.status === 401) redirect("/login?expired=1");
  if (res.status === 403 || res.status === 404) notFound();
  if (!res.ok) throw new Error(`server ${res.status}`);
  return (await res.json()) as T;
}

/** The shell data, fetched once per request however many layouts and pages ask. */
export const getShell = cache(() => serverFetch<ShellResponse>(api`/api/v1/me/shell`));
