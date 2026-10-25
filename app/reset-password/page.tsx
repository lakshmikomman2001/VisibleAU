"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  AuthNotice,
  authButtonStyle,
  authInputStyle,
  authLabelStyle,
  authTextStyle,
  SimpleAuthCard,
} from "@/components/domain/auth/simple-auth-card";
import { authClient } from "@/lib/auth/client";

/**
 * Where the reset email's link lands: better-auth checks the token and
 * sends the browser here with ?token=… (or ?error=INVALID_TOKEN).
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

const EXPIRED =
  "This link has expired or has already been used. Ask for a new one and use it within 60 minutes.";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(!token || params.get("error") ? EXPIRED : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setState("saving");
    setError(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setState("idle");
      setError(
        result.error.code === "INVALID_TOKEN"
          ? EXPIRED
          : (result.error.message ?? "Something went wrong. Please try again."),
      );
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <SimpleAuthCard title="Password changed">
        <p style={authTextStyle}>Your password has been changed. Sign in with the new one.</p>
        <Link href="/sign-in" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
          Sign in
        </Link>
      </SimpleAuthCard>
    );
  }

  return (
    <SimpleAuthCard title="Choose a new password">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <AuthNotice tone="error">{error}</AuthNotice>}
        {token && (
          <>
            <label htmlFor="new-password" style={authLabelStyle}>
              New password (at least 8 characters)
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={authInputStyle}
            />
            <label htmlFor="confirm-password" style={authLabelStyle}>
              The same password again
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={authInputStyle}
            />
            <button
              type="submit"
              disabled={state === "saving"}
              style={{ ...authButtonStyle, opacity: state === "saving" ? 0.5 : 1 }}
            >
              {state === "saving" ? "Saving…" : "Save new password"}
            </button>
          </>
        )}
      </form>
      <p style={{ ...authTextStyle, marginTop: 24, fontSize: 13 }}>
        <Link href="/forgot-password" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
          Ask for a new link
        </Link>
      </p>
    </SimpleAuthCard>
  );
}
