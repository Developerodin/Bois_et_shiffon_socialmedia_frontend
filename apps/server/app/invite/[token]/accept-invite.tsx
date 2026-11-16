"use client";

import { useEffect, useState } from "react";
import { AuthCard, AuthLink, PasswordFields, checkPasswords } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, authApi, errorMessage, type PublicInvitation } from "@/components/settings/api";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "ready"; invite: PublicInvitation }
  | { kind: "done" };

export function AcceptInvite({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi.invitation(token).then(
      (invite) => !cancelled && setState({ kind: "ready", invite }),
      (err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? { kind: "invalid" } : { kind: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  if (state.kind === "loading") {
    return (
      <AuthCard title="Loading invitation…">
        <p className="text-sm text-muted-foreground" aria-busy="true">
          Checking your invitation link.
        </p>
      </AuthCard>
    );
  }

  if (state.kind === "invalid") {
    return (
      <AuthCard
        title="Invitation not valid"
        description="This invitation link is invalid, has expired, or has already been used. Ask the person who invited you for a new one."
      >
        <AuthLink href="/login">Go to sign in</AuthLink>
      </AuthCard>
    );
  }

  if (state.kind === "error") {
    return (
      <AuthCard title="Something went wrong" description="We couldn't load this invitation.">
        <Button
          variant="outline"
          onClick={() => {
            setState({ kind: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </AuthCard>
    );
  }

  if (state.kind === "done") {
    return (
      <AuthCard title="You're in">
        <div className="space-y-4">
          <p role="status" className="text-sm text-foreground">
            Invitation accepted. Sign in to get started.
          </p>
          <AuthLink href="/login?invited=1">Continue to sign in</AuthLink>
        </div>
      </AuthCard>
    );
  }

  const { invite } = state;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invite.existingAccount) {
      const problem = checkPasswords(password, confirm);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.accept(
        invite.existingAccount ? { token } : { token, name: name.trim() || undefined, password },
      );
      setState({ kind: "done" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ kind: "invalid" });
      else setError(errorMessage(err, "Couldn't accept the invitation. Try again."));
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={`Join ${invite.projectName ?? invite.workspaceName}`}
      description={
        <>
          You&apos;ve been invited as <span className="text-foreground">{invite.roleName}</span>{" "}
          {invite.projectName ? <>on {invite.projectName} in {invite.workspaceName} </> : null}
          using <span className="text-foreground">{invite.email}</span>.
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {invite.existingAccount ? (
          <p className="text-sm text-muted-foreground">
            You already have an account. Accept to add this workspace to it, then sign in with Google or your
            password as usual.
          </p>
        ) : (
          <>
            <label className="block text-sm">
              <span className="text-muted-foreground">Your name</span>
              <Input
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </label>
            <PasswordFields
              password={password}
              confirm={confirm}
              onPassword={setPassword}
              onConfirm={setConfirm}
            />
          </>
        )}
        <p aria-live="polite" className="text-sm text-destructive empty:hidden">
          {error}
        </p>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Accepting…" : invite.existingAccount ? "Accept invitation" : "Create account & join"}
        </Button>
      </form>
    </AuthCard>
  );
}
