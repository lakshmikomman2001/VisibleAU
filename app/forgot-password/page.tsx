"use client";

import Link from "next/link";
import { useState } from "react";
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
 * Asks better-auth to email a reset link. The answer is the same whether
 * or not the address has an account -- this page never says which.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "limited" | "failed">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    if (!error) setState("sent");
    else setState(error.status === 429 ? "limited" : "failed");
  }

  return (
    <SimpleAuthCard title="Reset your password">
      {state === "sent" ? (
        <AuthNotice tone="info">
          If there&apos;s an account for {email}, we&apos;ve emailed it a link to choose a new
          password. The link works for 60 minutes.
        </AuthNotice>
      ) : (
        <>
          <p style={authTextStyle}>
            Enter the email address you sign in with and we&apos;ll email you a link to choose a new
            password.
          </p>
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            {state === "limited" && (
              <AuthNotice tone="error">Too many requests. Please try again in an hour.</AuthNotice>
            )}
            {state === "failed" && (
              <AuthNotice tone="error">Something went wrong. Please try again.</AuthNotice>
            )}
            <label htmlFor="reset-email" style={authLabelStyle}>
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={authInputStyle}
            />
            <button
              type="submit"
              disabled={state === "sending"}
              style={{ ...authButtonStyle, opacity: state === "sending" ? 0.5 : 1 }}
            >
              {state === "sending" ? "Sending…" : "Email me a reset link"}
            </button>
          </form>
        </>
      )}
      <p style={{ ...authTextStyle, marginTop: 24, fontSize: 13 }}>
        <Link href="/sign-in" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
          Back to sign in
        </Link>
      </p>
    </SimpleAuthCard>
  );
}
