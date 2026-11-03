import { signIn } from "@/auth";
import { PendingButton } from "@/components/auth/pending-button";
import { EspandaLogo } from "@/components/brand/espanda-logo";
import { Input } from "@/components/ui/input";
import { AuthError, CredentialsSignin } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

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

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Entrance stagger for the n-th part of the form (with the .rise-in class). */
const rise = (n: number) => ({ animationDelay: `${n * 40}ms` });

/** Where to go after sign-in: a same-site path only ("/x", never "//host" or "https://…"). */
function safeNext(next?: string, callbackUrl?: string): string {
  const path = next ?? (callbackUrl ? pathOf(callbackUrl) : "/");
  const ok = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") && !path.startsWith("/login");
  return ok ? path : "/";
}

// The sign-in middleware sends ?callbackUrl=<absolute URL>; keep only its path, so it can't leave this site.
function pathOf(url: string) {
  try {
    const u = new URL(url, "http://local");
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; invited?: string; expired?: string; next?: string; callbackUrl?: string }>;
}) {
  const { error, reset, invited, expired, next: nextParam, callbackUrl } = await searchParams;
  const next = safeNext(nextParam, callbackUrl);
  const keepNext = next === "/" ? "" : `&next=${encodeURIComponent(next)}`;
  const message = error ? (ERRORS[error] ?? ERRORS.invalid) : null;
  const notice = reset
    ? "Password updated. Sign in with your new password."
    : invited
      ? "Invitation accepted. Sign in to continue."
      : expired
        ? "You were signed out (the session ended, or you signed out elsewhere). Sign in again to pick up where you were."
        : null;
  return (
    <main className="surface-glow relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[1.1fr_1fr]">
        {/* The form comes first in the page order: on a phone it's what you see; on a wide screen it sits right. */}
        <section aria-labelledby="signin-h" className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:order-2 lg:py-20">
          {/* Entrance: the form's parts settle in top to bottom (rise-in, ~40 ms apart), then the example morning on the
              left plays. Nothing waits on it: every field works from the first frame. */}
          <div className="rise-in" style={rise(0)}>
            <EspandaLogo height={34} priority />
          </div>
          <div className="mt-10 w-full max-w-sm">
            <h1 id="signin-h" className="rise-in font-display text-4xl font-medium tracking-tight text-balance" style={rise(1)}>
              Sign in
            </h1>
            <p className="rise-in mt-3 text-sm text-muted-foreground" style={rise(2)}>
              {googleEnabled
                ? "New here? Continue with Google to create your account."
                : "Use the email and password from your invitation."}
            </p>
            {notice && !message ? (
              <p role="status" className="rise-in mt-6 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" style={rise(3)}>
                {notice}
              </p>
            ) : null}
            {googleEnabled ? (
              <>
                <form
                  className="rise-in mt-8"
                  style={rise(4)}
                  action={async () => {
                    "use server";
                    await signIn("google", { redirectTo: next });
                  }}
                >
                  <PendingButton variant="outline" pendingLabel="Opening Google…" className="h-11 w-full">
                    <GoogleMark />
                    Continue with Google
                  </PendingButton>
                </form>
                <div className="rise-in mt-6 flex items-center gap-3 text-xs text-muted-foreground" style={rise(5)}>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  or with email
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
              </>
            ) : null}
            <form
              className="rise-in mt-6 space-y-4"
              style={rise(6)}
              action={async (formData) => {
                "use server";
                try {
                  await signIn("credentials", {
                    email: formData.get("email"),
                    password: formData.get("password"),
                    redirectTo: next,
                  });
                } catch (error) {
                  if (error instanceof AuthError) {
                    // Only CredentialsSignin means "wrong email/password"; anything else (e.g. the DB is
                    // unreachable) must not tell people their password is wrong.
                    const code = !(error instanceof CredentialsSignin)
                      ? "unavailable"
                      : error.code === "rate_limited"
                        ? "rate_limited"
                        : "invalid";
                    redirect(`/login?error=${code}${keepNext}`);
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
                  className="mt-1.5 h-11"
                />
              </label>
              {message ? (
                <p role="alert" className="rise-in text-sm text-destructive">
                  {message}
                </p>
              ) : null}
              <PendingButton pendingLabel="Signing in…" className="h-11 w-full">
                Sign in
              </PendingButton>
              <div className="text-center">
                <Link
                  href="/forgot-password"
                  className="inline-block rounded-sm py-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Forgot password?
                </Link>
              </div>
            </form>
          </div>
        </section>

        <MorningLog />
      </div>
    </main>
  );
}

/**
 * The page's one picture: an example of the Agent Log people find when they sign in. Typeset like the real log
 * (time, agent, what it did), and labelled as an example. It ends where signing in begins: drafts waiting for a
 * person, because agents never publish on their own.
 */
const MORNING: { at: string; agent: string; text: string; tone?: "warn" | "you" }[] = [
  { at: "06:00", agent: "Research", text: "Read 38 pages of your website and updated your brand voice." },
  { at: "06:07", agent: "Opportunities", text: "Found 7 post ideas in this week's searches." },
  { at: "06:12", agent: "Planner", text: "Put 4 of them on next week's calendar." },
  { at: "06:18", agent: "Creator", text: "Drafted a carousel and two Threads posts." },
  { at: "06:19", agent: "Quality check", text: "Held one draft back: “FSC certified” isn’t in your product information.", tone: "warn" },
  { at: "06:21", agent: "You", text: "2 drafts are waiting for your approval.", tone: "you" },
];

function MorningLog() {
  return (
    <aside aria-labelledby="morning-h" className="flex flex-col justify-center border-t border-border px-6 py-12 sm:px-12 lg:order-1 lg:border-r lg:border-t-0 lg:py-20">
      <p id="morning-h" className="text-xs text-muted-foreground">
        An example morning
      </p>
      <ol className="mt-6 max-w-lg border-l border-border">
        {MORNING.map((l, i) => (
          <li
            key={l.at}
            className={`log-line-in relative grid grid-cols-[3.5rem_1fr] gap-x-3 py-2.5 pl-5 ${l.tone === "you" ? "mt-2" : ""}`}
            // Starts once the form has settled (its last part rises in at ~240 ms).
            style={{ animationDelay: `${320 + i * 140}ms` }}
          >
            <span
              aria-hidden="true"
              className={`absolute -left-[5px] top-[1.05rem] size-2.5 rounded-full border-2 border-background ${l.tone === "warn" ? "bg-warning" : l.tone === "you" ? "status-pulse bg-primary" : "bg-success"}`}
            />
            <time className="pt-0.5 font-mono text-xs tabular-nums text-muted-foreground">{l.at}</time>
            <p className={`text-sm ${l.tone === "you" ? "font-medium text-primary" : "text-foreground"}`}>
              <span className={`mr-2 text-xs font-medium ${l.tone === "warn" ? "text-warning" : "text-muted-foreground"}`}>{l.agent}</span>
              {l.text}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-8 max-w-sm font-display text-xl italic leading-snug text-muted-foreground">
        Agents draft and check. Nothing is published until someone on your team approves it.
      </p>
    </aside>
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
