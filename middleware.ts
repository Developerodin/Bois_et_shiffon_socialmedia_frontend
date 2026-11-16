import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
const PUBLIC_PATHS = ["/login", "/invite/", "/forgot-password", "/reset-password"];

/** True when a request carries an Auth.js session cookie (or its .0 chunk). Existence only: the server checks the session itself. */
export function hasSessionCookie(cookies: { name: string }[]): boolean {
  return cookies.some(({ name }) => SESSION_COOKIES.some((c) => name === c || name === `${c}.0`));
}

// Pages only check that a session cookie exists, so the website needs none of the Server's auth code. A stale or
// revoked cookie gets through here and is turned away by the Server's 401 (lib/server-fetch.ts sends it to /login).
// /api/* never reaches this middleware: it is rewritten to the Server (next.config.ts), whose own middleware rolls
// the session cookie forward.
export default function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!PUBLIC_PATHS.some((p) => pathname.startsWith(p)) && !hasSessionCookie(request.cookies.getAll())) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  // The request also carries x-pathname (path + query) so a server component that gets a 401 can send the person
  // back here after sign-in (lib/server-fetch.ts).
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Left out: the Server's /api, the load balancer's /healthz, and public files (the sign-in pages show the logo in
  // public/brand and the tab icon before anyone signs in).
  matcher: ["/((?!api/|healthz|_next/static|_next/image|favicon.ico|icon.png|brand/).*)"],
};
