import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

// Auth.js types `auth` as many overloads; as middleware it takes (request, event) and returns a Response.
const authMiddleware = NextAuth(authConfig).auth as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

// The auth check is unchanged. On a pass-through, the request also carries x-pathname (path + query) so a server
// component that gets a 401 can send the person back here after sign-in (lib/server-fetch.ts).
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const result = await authMiddleware(request, event);
  if (result.status >= 300 && result.status < 400) return result;
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  const next = NextResponse.next({ request: { headers } });
  for (const cookie of result.headers.getSetCookie()) next.headers.append("set-cookie", cookie);
  return next;
}

export const config = {
  // Public files are left out: the sign-in pages show the logo (public/brand) and the tab icon before anyone signs in.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icon.png|brand/).*)"],
};
