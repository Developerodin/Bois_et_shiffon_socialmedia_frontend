"use client";

import { useState } from "react";
import { AuthCard, AuthLink, PasswordFields, checkPasswords } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { ApiError, authApi } from "@/components/settings/api";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = checkPasswords(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.reset(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 422)) setInvalid(true);
      else setError("Couldn't reset your password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <AuthCard title="Link not valid" description="This reset link is invalid or has expired.">
        <AuthLink href="/forgot-password">Request a new link</AuthLink>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <div className="space-y-4">
          <p role="status" className="text-sm text-foreground">
            Your password has been changed and you&apos;ve been signed out everywhere.
          </p>
          <AuthLink href="/login?reset=1">Sign in with your new password</AuthLink>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <PasswordFields
          label="New password"
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        <p aria-live="polite" className="text-sm text-destructive empty:hidden">
          {error}
        </p>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </AuthCard>
  );
}
