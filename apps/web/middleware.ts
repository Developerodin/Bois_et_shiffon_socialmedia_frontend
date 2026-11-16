import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

// Auth.js types `auth` as many overloads; as middleware it takes (request, event) and returns a Response.
const authMiddleware = NextAuth(authConfig).auth as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
const PUBLIC_PATHS = ["/login", "/invite/", "/forgot-password", "/reset-password", "/healthz"];

/** True when a request carries an Auth.js session cookie (or its .0 chunk). Existence only: the server checks the session itself. */
export function hasSessionCookie(cookies: { name: string }[]): boolean {
  return cookies.some(({ name }) => SESSION_COOKIES.some((c) => name === c || name === `${c}.0`));
}

// Pages only check that a session cookie exists, so the website needs none of the server's auth code. A stale or
// revoked cookie gets through here and is turned away by the server's 401 (lib/server-fetch.ts sends it to /login).
// /api/v1/* keeps the Auth.js middleware: it rolls the session cookie forward on each call.
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/v1");
  if (!isApi && !PUBLIC_PATHS.some((p) => pathname.startsWith(p)) && !hasSessionCookie(request.cookies.getAll())) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  const result = isApi ? await authMiddleware(request, event) : null;
  if (result && result.status >= 300 && result.status < 400) return result;
  // The request also carries x-pathname (path + query) so a server component that gets a 401 can send the person
  // back here after sign-in (lib/server-fetch.ts).
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname + search);
  const next = NextResponse.next({ request: { headers } });
  for (const cookie of result?.headers.getSetCookie() ?? []) next.headers.append("set-cookie", cookie);
  return next;
}

export const config = {
  // Public files are left out: the sign-in pages show the logo (public/brand) and the tab icon before anyone signs in.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icon.png|brand/).*)"],
};
