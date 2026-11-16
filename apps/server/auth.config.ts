import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Stateless JWT (encrypted cookie). Revocation via User.sessionVersion in auth.ts.
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days, rolling
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;
      // Public account pages: sign-in, accept invitation, password reset.
      const isLogin = ["/login", "/invite/", "/forgot-password", "/reset-password"].some((p) =>
        pathname.startsWith(p),
      );
      const isVersionedApi = pathname.startsWith("/api/v1");

      if (isVersionedApi) {
        return true;
      }
      if (isLogin) {
        return true;
      }
      if (!isLoggedIn) {
        return false;
      }
      return true;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
