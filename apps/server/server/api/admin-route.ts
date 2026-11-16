import { problemResponse } from "@/server/api/http-error";
import { platformAdmin } from "@/server/auth/platform-admin";
import { usdInrRate } from "@/server/usage/fx";

/** Not found, and what a non-admin gets for every admin route (a 403 would reveal that the console exists). */
export const notFoundResponse = () => problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Not found", status: 404 });

/** Guard for /api/v1/admin/*: the platform admin's user id, the 401 for no session, or a 404 for anyone else. */
export async function adminOnly(request: Request): Promise<string | Response> {
  const admin = await platformAdmin(request);
  return admin instanceof Response && admin.status === 403 ? notFoundResponse() : admin;
}

/** A value as it looks after JSON: dates are ISO strings. (Response.json does the conversion; this only retypes.) */
export type Wire<T> = T extends Date ? string : T extends (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
export const wire = <T>(value: T) => value as unknown as Wire<T>;

/** The request's query as the pages receive it: the first value of each key. */
export const queryOf = (request: Request): Record<string, string | undefined> => Object.fromEntries(new URL(request.url).searchParams);

/** USD to INR for spend-bearing responses; null when no rate is available (callers show USD only). */
export const usdInr = async () => (await usdInrRate())?.rate ?? null;

/** The next page number of an offset-paged list, or null on the last page. */
export const nextPage = (hasMore: boolean, page: number) => (hasMore ? String(page + 1) : null);
