"use client";

import { useState } from "react";
import {
  AuthNotice,
  authButtonStyle,
  authTextStyle,
  SimpleAuthCard,
} from "@/components/domain/auth/simple-auth-card";
import { authClient } from "@/lib/auth/client";
import { maskEmail } from "@/lib/email/mask";

const secondaryButtonStyle = {
  ...authButtonStyle,
  marginTop: 0,
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  marginTop: 16,
  fontSize: 13,
  color: "var(--accent-blue)",
  textDecoration: "underline",
  cursor: "pointer",
};

/**
 * 3 Nov -- what sign-up shows once an account exists, and sign-in shows for one
 * that isn't verified: no session yet, the link is on its way. `callbackURL` is
 * where the person was going, which the link comes back to through sign-in.
 *
 * Resend is limited to 3 an hour for each address, shared with the sends sign-in
 * makes (lib/auth/emails.ts).
 */
export function CheckInbox({
  email,
  callbackURL,
  onStartAgain,
}: {
  email: string;
  callbackURL: string;
  onStartAgain: () => void;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "limited" | "failed">("idle");

  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL });
    if (!error) setState("sent");
    else setState(error.status === 429 ? "limited" : "failed");
  }

  return (
    <SimpleAuthCard title="Check your inbox">
      <p style={authTextStyle}>{`Check your inbox to verify ${maskEmail(email)}`}</p>
      <p style={authTextStyle}>
        Open the link we sent, then sign in. It works for 24 hours. If it isn&apos;t there, look in
        your spam folder.
      </p>
      {state === "sent" && <AuthNotice tone="info">We&apos;ve sent another link.</AuthNotice>}
      {state === "limited" && (
        <AuthNotice tone="error">Too many requests. Please try again in an hour.</AuthNotice>
      )}
      {state === "failed" && (
        <AuthNotice tone="error">The email couldn&apos;t be sent. Please try again.</AuthNotice>
      )}
      <button
        type="button"
        onClick={resend}
        disabled={state === "sending"}
        style={{ ...secondaryButtonStyle, opacity: state === "sending" ? 0.5 : 1 }}
      >
        {state === "sending" ? "Sending…" : "Resend link"}
      </button>
      <button type="button" onClick={onStartAgain} style={linkButtonStyle}>
        Wrong address? Start again
      </button>
    </SimpleAuthCard>
  );
}
