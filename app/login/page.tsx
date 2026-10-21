import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthError, CredentialsSignin } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const ERRORS: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  rate_limited: "Too many sign-in attempts. Wait 15 minutes and try again.",
  google_unverified: "Google didn't confirm this email address. Use a verified Google account or sign in with email.",
  disabled: "This account is disabled. Ask a workspace owner to restore it.",
  AccessDenied: "Google sign-in was cancelled or not allowed for this account.",
  OAuthAccountNotLinked: "This email already has an account. Sign in with email and password.",
  OAuthCallbackError: "Google sign-in didn't complete. Try again.",
  Configuration: "Google sign-in isn't set up correctly. Ask an admin to check the Google client settings.",
};

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; invited?: string }>;
}) {
  const { error, reset, invited } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.invalid) : null;
  const notice = reset
    ? "Password updated. Sign in with your new password."
    : invited
      ? "Invitation accepted. Sign in to continue."
      : null;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Sign in to Prow PLUS
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {googleEnabled
            ? "New here? Continue with Google to create your account."
            : "Use the email and password from your invitation."}
        </p>
        {notice && !message ? (
          <p role="status" className="mt-4 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            {notice}
          </p>
        ) : null}
        {googleEnabled ? (
          <>
            <form
              className="mt-6"
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                <GoogleMark />
                Continue with Google
              </Button>
            </form>
            <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              or with email
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>
          </>
        ) : null}
        <form
          className="mt-6 space-y-4"
          action={async (formData) => {
            "use server";
            try {
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: "/",
              });
            } catch (error) {
              if (error instanceof AuthError) {
                const code =
                  error instanceof CredentialsSignin && error.code === "rate_limited"
                    ? "rate_limited"
                    : "invalid";
                redirect(`/login?error=${code}`);
              }
              throw error;
            }
          }}
        >
          <label className="block text-sm">
            <span className="text-muted-foreground">Email</span>
            <Input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1"
              placeholder="you@yourbrand.com"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Password</span>
            <Input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1"
            />
          </label>
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
          <Button type="submit" className="w-full">
            Continue
          </Button>
          <div className="text-center">
            <Link
              href="/forgot-password"
              className="rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Forgot password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Google "G" mark, in Google's own colours as its sign-in guidelines require. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
