import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PasswordInput } from "@/components/ui/password-input";

/** Centered card under the logo, for the account pages (reset password, invitation). */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 py-12">
      <BrandLogo height={44} priority />
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-sm py-1 text-sm text-link underline underline-offset-4 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

export const MIN_PASSWORD = 12;

/** Returns an error message, or null when the pair is acceptable. */
export function checkPasswords(password: string, confirm: string) {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return "Passwords don't match.";
  return null;
}

export function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  label = "Password",
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  label?: string;
}) {
  return (
    <>
      <label className="block text-sm">
        <span className="text-muted-foreground">{label}</span>
        <PasswordInput
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          placeholder="Choose a password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          aria-describedby="password-hint"
          className="mt-1.5 h-11"
        />
        <span id="password-hint" className="mt-1 block text-xs text-muted-foreground">
          At least {MIN_PASSWORD} characters.
        </span>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Confirm password</span>
        <PasswordInput
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          className="mt-1.5 h-11"
        />
      </label>
    </>
  );
}
