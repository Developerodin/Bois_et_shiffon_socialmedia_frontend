import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthError, CredentialsSignin } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const ERRORS: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  rate_limited: "Too many sign-in attempts. Wait 15 minutes and try again.",
};

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
          Sign in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Auth.js (DEC-001). Requires <code className="font-mono text-xs">AUTH_SECRET</code> and a seeded user (see{" "}
          <code className="font-mono text-xs">docs/ENV_SETUP.md</code>).
        </p>
        {notice && !message ? (
          <p role="status" className="mt-4 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            {notice}
          </p>
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
              placeholder="owner@example.com"
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
