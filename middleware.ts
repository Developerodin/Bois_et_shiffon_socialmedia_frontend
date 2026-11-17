import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];
const PUBLIC_PATHS = ["/login", "/invite/", "/forgot-password", "/reset-password"];

/** True when a request carries an Auth.js session cookie (or its .0 chunk). Existence only: the server checks the session itself. */
export function hasSessionCookie(cookies: { name: string }[]): boolean {
  return cookies.some(({ name }) => SESSION_COOKIES.some((c) => name === c || name === `${c}.0`));
}

/** The report-only policy. img-src allows any https host on purpose: product images come from any shop host, avatars from Google. */
export function contentSecurityPolicy(nonce: string, storageOrigin?: string): string {
  const storage = storageOrigin ? ` ${storageOrigin}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `media-src 'self' blob:${storage}`,
    `connect-src 'self'${storage}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

// Set here rather than in next.config.ts headers(): the nonce is new per request and the image bakes no env.
// Report-only, and there is no report endpoint yet: browsers log violations to the console only.
function withSecurityHeaders(res: NextResponse, policy: string): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  res.headers.set("Content-Security-Policy-Report-Only", policy);
  return res;
}

// Pages only check that a session cookie exists, so the website needs none of the Server's auth code. A stale or
// revoked cookie gets through here and is turned away by the Server's 401 (lib/server-fetch.ts sends it to /login).
// /api/* never reaches this middleware: it is rewritten to the Server (next.config.ts), whose own middleware rolls
// the session cookie forward.
/** The origin of STORAGE_ORIGIN, or undefined when it is not a clean http(s) URL: a typo must not inject policy sources or break the header. */
function cleanOrigin(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? "");
    // URL still accepts characters such as a comma in a host; a comma would start a second policy.
    return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/.test(url.origin) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export default function middleware(request: NextRequest) {
  const policy = contentSecurityPolicy(btoa(crypto.randomUUID()), cleanOrigin(process.env.STORAGE_ORIGIN));
  const { pathname, search } = request.nextUrl;
  if (!PUBLIC_PATHS.some((p) => pathname.startsWith(p)) && !hasSessionCookie(request.cookies.getAll())) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return withSecurityHeaders(NextResponse.redirect(login), policy);
  }
  // The request also carries x-pathname (path + query) so a server component that gets a 401 can send the person
  // back here after sign-in (lib/server-fetch.ts).
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname + search);
  // Next reads the nonce from the request's policy header and stamps its scripts. Only the report-only one is set: a
  // request content-security-policy header would be read first and carries no nonce.
  headers.set("content-security-policy-report-only", policy);
  return withSecurityHeaders(NextResponse.next({ request: { headers } }), policy);
}

export const config = {
  // Left out: the Server's /api, the load balancer's /healthz, and public files (the sign-in pages show the logo in
  // public/brand and the tab icon before anyone signs in).
  matcher: ["/((?!api/|healthz$|_next/static|_next/image|favicon.ico|icon.png|brand/).*)"],
};
