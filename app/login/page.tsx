import { EspandaLogo } from "@/components/brand/espanda-logo";
import { LoginForm } from "@/components/auth/login-form";

/** Entrance stagger for the n-th part of the form (with the .rise-in class). */
const rise = (n: number) => ({ animationDelay: `${n * 40}ms` });

/** Where to go after sign-in: a same-site path only ("/x", never "//host" or "https://…"). */
function safeNext(next?: string | string[], callbackUrl?: string | string[]): string {
  const raw = typeof next === "string" ? next : typeof callbackUrl === "string" ? pathOf(callbackUrl) : "/";
  // Browsers drop tabs/newlines in Location, so "/\t/evil.com" would become "//evil.com": reject control chars and backslashes.
  if (!raw.startsWith("/") || /[\x00-\x1f\\]/.test(raw)) return "/";
  const path = pathOf(raw);
  const ok = !path.startsWith("//") && !path.startsWith("/login");
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
            <LoginForm next={next} error={error} expired={Boolean(expired)} notice={notice} />
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
