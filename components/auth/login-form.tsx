"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getProviders, getSession, signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  unavailable: "We couldn't check your sign-in just now. Try again in a moment.",
  rate_limited: "Too many sign-in attempts. Wait 15 minutes and try again.",
  google_unverified: "Google didn't confirm this email address. Use a verified Google account or sign in with email.",
  disabled: "This account is disabled. Ask a workspace owner to restore it.",
  AccessDenied: "Google sign-in was cancelled or not allowed for this account.",
  OAuthAccountNotLinked: "This email already has an account. Sign in with email and password.",
  OAuthCallbackError: "Google sign-in didn't complete. Try again.",
  Configuration: "Google sign-in isn't set up correctly. Ask an admin to check the Google client settings.",
};

/** Entrance stagger for the n-th part of the form (with the .rise-in class). */
const rise = (n: number) => ({ animationDelay: `${n * 40}ms` });

const buttonMotion = "transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100";

/**
 * The message for a failed credentials sign-in. Only a CredentialsSignin means "wrong email/password" (or a code the
 * server set on it: rate_limited, disabled); anything else, such as the database being unreachable, must not tell
 * people their password is wrong.
 */
export function loginMessage(result: { error?: string | null; code?: string | null }): string | null {
  if (!result.error) return null;
  if (result.error !== "CredentialsSignin") return ERRORS.unavailable;
  const known = result.code && result.code !== "invalid" ? ERRORS[result.code] : undefined;
  return known ?? ERRORS.invalid;
}

export function LoginForm({ next, error, expired, notice }: { next: string; error?: string; expired: boolean; notice: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  // ?error= comes back from Google; an unknown value reads as a wrong password.
  const [message, setMessage] = useState<string | null>(error ? (ERRORS[error] ?? ERRORS.invalid) : null);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    let live = true;
    void getProviders().then((p) => live && setGoogle(Boolean(p?.google)), () => {});
    // Already signed in: go where they were headed. Not after an "expired" bounce, so a half-valid session can't loop.
    if (!expired) void getSession().then((s) => live && s?.user && router.replace(next), () => {});
    return () => {
      live = false;
    };
  }, [next, expired, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        setMessage(loginMessage(result ?? { error: "Configuration" }));
        setPending(false);
        return;
      }
      router.replace(next);
    } catch {
      setMessage(ERRORS.unavailable);
      setPending(false);
    }
  }

  return (
    <>
      <p className="rise-in mt-3 text-sm text-muted-foreground" style={rise(2)}>
        {google ? "New here? Continue with Google to create your account." : "Use the email and password from your invitation."}
      </p>
      {notice && !message ? (
        <p role="status" className="rise-in mt-6 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" style={rise(3)}>
          {notice}
        </p>
      ) : null}
      {google ? (
        <>
          <div className="rise-in mt-8" style={rise(4)}>
            <Button
              type="button"
              variant="outline"
              disabled={googlePending}
              aria-busy={googlePending}
              className={`h-11 w-full ${buttonMotion}`}
              onClick={() => {
                setGooglePending(true);
                void signIn("google", { redirectTo: next });
              }}
            >
              {googlePending ? (
                <>
                  <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Opening Google…
                </>
              ) : (
                <>
                  <GoogleMark />
                  Continue with Google
                </>
              )}
            </Button>
          </div>
          <div className="rise-in mt-6 flex items-center gap-3 text-xs text-muted-foreground" style={rise(5)}>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            or with email
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
        </>
      ) : null}
      <form className="rise-in mt-6 space-y-4" style={rise(6)} onSubmit={submit}>
        <label className="block text-sm">
          <span className="text-muted-foreground">Email</span>
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-11"
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-11"
          />
        </label>
        {message ? (
          <p role="alert" className="rise-in text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} aria-busy={pending} className={`h-11 w-full ${buttonMotion}`}>
          {pending ? (
            <>
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
        <div className="text-center">
          <Link
            href="/forgot-password"
            className="inline-block rounded-sm py-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Forgot password?
          </Link>
        </div>
      </form>
    </>
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
