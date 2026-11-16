"use client";

import { useState } from "react";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, authApi } from "@/components/settings/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<"sent" | "no_email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await authApi.forgot(email.trim());
      setSent(res.emailConfigured === false ? "no_email" : "sent");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many requests. Wait a few minutes and try again."
          : "Couldn't send the request. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Forgot password"
      description="Enter your account email and we'll send a link to choose a new password."
    >
      {sent ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-foreground">
            {sent === "no_email"
              ? "Password emails aren't set up on this server yet. Ask your workspace owner to reset it for you."
              : "If an account exists, we've sent a reset link."}
          </p>
          <AuthLink href="/login">Back to sign in</AuthLink>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="text-muted-foreground">Email</span>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </label>
          <p aria-live="polite" className="text-sm text-destructive empty:hidden">
            {error}
          </p>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
          <div className="text-center">
            <AuthLink href="/login">Back to sign in</AuthLink>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
