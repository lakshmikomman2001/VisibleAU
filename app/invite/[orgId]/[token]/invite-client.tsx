"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AuthNotice,
  authButtonStyle,
  authTextStyle,
  SimpleAuthCard,
} from "@/components/domain/auth/simple-auth-card";
import { authClient } from "@/lib/auth/client";

/**
 * Accepts through members/accept/route.ts, which needs the account to be
 * the one invited and its email address verified; when it isn't verified
 * yet, this offers to email a verification link that comes back to this
 * same page. An account with no workspace joins the inviting one and goes
 * straight to its dashboard.
 */
type State =
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "joined" }
  | { kind: "needs_verification"; sent: boolean }
  | { kind: "error"; message: string };

const VERIFY_FIRST = "Please verify your email address before accepting this invitation";

export function AcceptInvite({
  orgId,
  token,
  email,
}: {
  orgId: string;
  token: string;
  email: string;
}) {
  const [state, setState] = useState<State>({ kind: "accepting" });
  const started = useRef(false);

  useEffect(() => {
    // Accepting changes state, so do it once (dev mode runs effects twice).
    if (started.current) return;
    started.current = true;
    fetch(`/api/organizations/${orgId}/members/accept?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { error?: string; joined?: boolean };
        if (res.ok && body.joined) {
          setState({ kind: "joined" });
          window.location.href = "/dashboard";
        } else if (res.ok) setState({ kind: "accepted" });
        else if (body.error === VERIFY_FIRST) setState({ kind: "needs_verification", sent: false });
        else
          setState({
            kind: "error",
            message: body.error ?? "This invitation couldn't be accepted.",
          });
      })
      .catch(() => setState({ kind: "error", message: "Something went wrong. Please try again." }));
  }, [orgId, token]);

  async function sendVerification() {
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: window.location.pathname,
    });
    if (error) {
      setState({
        kind: "error",
        message:
          error.status === 429
            ? "Too many requests. Please try again in an hour."
            : "The verification email couldn't be sent. Please try again.",
      });
      return;
    }
    setState({ kind: "needs_verification", sent: true });
  }

  const linkStyle = { color: "var(--accent-blue)" };
  return (
    <SimpleAuthCard title="Team invitation">
      <div role="status" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {state.kind === "accepting" && <p style={authTextStyle}>Accepting the invitation…</p>}
        {state.kind === "joined" && <p style={authTextStyle}>You&apos;ve joined the team…</p>}
        {state.kind === "accepted" && (
          <p style={authTextStyle}>
            You&apos;ve joined the team.{" "}
            <Link href="/dashboard" style={linkStyle}>
              Go to Overview
            </Link>
          </p>
        )}
        {state.kind === "needs_verification" &&
          (state.sent ? (
            <p style={authTextStyle}>
              We&apos;ve emailed a verification link to {email}. Open it and you&apos;ll come back
              here to finish accepting.
            </p>
          ) : (
            <>
              <p style={authTextStyle}>
                Before you can accept, confirm that this email address is yours.
              </p>
              <button type="button" onClick={sendVerification} style={authButtonStyle}>
                Email me a verification link
              </button>
            </>
          ))}
      </div>
      {state.kind === "error" && (
        <>
          <AuthNotice tone="error">{state.message}</AuthNotice>
          <p style={authTextStyle}>
            <Link href="/dashboard" style={linkStyle}>
              Back to VisibleAU
            </Link>
          </p>
        </>
      )}
    </SimpleAuthCard>
  );
}
