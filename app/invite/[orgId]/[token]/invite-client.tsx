"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AuthNotice,
  authButtonStyle,
  authTextStyle,
  SimpleAuthCard,
} from "@/components/domain/auth/simple-auth-card";
import { authClient, signOut } from "@/lib/auth/client";
import { authPagePath } from "@/lib/auth/paths";
import { maskEmail } from "@/lib/email/mask";
import { PRODUCT_NAME } from "@/lib/product";

/**
 * Accepts through members/accept/route.ts, which needs the account to be
 * the one invited and its email address verified; when it isn't verified
 * yet, this offers to email a verification link that comes back to this
 * same page. An account with no workspace joins the inviting one and goes
 * straight to its dashboard.
 *
 * Team follow-ups (31 Oct), item 2: signed in with a different account than
 * the invited one, it says which account is signed in and who the invite is
 * for (both masked), and "Sign out and continue" signs out and comes back
 * to this invite through sign-in.
 */
type State =
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "joined" }
  | { kind: "needs_verification"; sent: boolean }
  | { kind: "wrong_account"; invitedAs: string | null }
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
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          invitedAs?: string | null;
          joined?: boolean;
        };
        if (res.ok && body.joined) {
          setState({ kind: "joined" });
          window.location.href = "/dashboard";
        } else if (res.ok) setState({ kind: "accepted" });
        else if (body.error === VERIFY_FIRST) setState({ kind: "needs_verification", sent: false });
        else if (body.code === "wrong_account")
          setState({ kind: "wrong_account", invitedAs: body.invitedAs ?? null });
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

  const [signingOut, setSigningOut] = useState(false);
  function signOutAndContinue() {
    setSigningOut(true);
    void signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = authPagePath("/sign-in", `/invite/${orgId}/${token}`);
        },
        onError: () => {
          setSigningOut(false);
          setState({ kind: "error", message: "Signing out didn't work. Please try again." });
        },
      },
    });
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
        {state.kind === "wrong_account" && (
          <p style={authTextStyle} data-wrong-account>
            You&apos;re signed in as {maskEmail(email)}.{" "}
            {state.invitedAs
              ? `This invite is for ${state.invitedAs}.`
              : "This invite is for a different email address."}
          </p>
        )}
      </div>
      {state.kind === "wrong_account" && (
        <>
          <button
            type="button"
            onClick={signOutAndContinue}
            disabled={signingOut}
            style={{ ...authButtonStyle, opacity: signingOut ? 0.5 : 1 }}
          >
            {signingOut ? "Signing out…" : "Sign out and continue"}
          </button>
          <p style={{ ...authTextStyle, marginTop: 16 }}>
            <Link href="/dashboard" style={linkStyle}>
              Back to {PRODUCT_NAME}
            </Link>
          </p>
        </>
      )}
      {state.kind === "error" && (
        <>
          <AuthNotice tone="error">{state.message}</AuthNotice>
          <p style={authTextStyle}>
            <Link href="/dashboard" style={linkStyle}>
              Back to {PRODUCT_NAME}
            </Link>
          </p>
        </>
      )}
    </SimpleAuthCard>
  );
}
