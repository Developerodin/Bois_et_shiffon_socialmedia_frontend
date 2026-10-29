import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Public files are left out: the sign-in pages show the logo (public/brand) and the tab icon before anyone signs in.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icon.png|brand/).*)"],
};
