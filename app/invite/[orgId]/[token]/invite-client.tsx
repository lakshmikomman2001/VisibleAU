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
 *
 * Item 5: an account with its own open workspace chooses. "Switch to <org>"
 * says plainly what happens to its own workspace (it stays as it is, out of
 * sight, and there's no switching back) and asks again before switching;
 * "Not now" changes nothing. Sri, 8 Nov: the only owner of a workspace that
 * still has a subscription, other people or schedules can't switch away; the
 * page says why instead of offering it (the server refuses it either way).
 */
interface Choice {
  orgName: string;
  role: string;
  ownWorkspaceName: string;
  expiresAt: string;
  /** Why "Switch" would be refused (members/accept/route.ts), when it would. */
  switchBlocked?: string;
}

type State =
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "joined" }
  | { kind: "needs_verification"; sent: boolean }
  | { kind: "wrong_account"; invitedAs: string | null }
  | { kind: "choice"; choice: Choice; step: "offer" | "confirm" | "switching" | "not_now" }
  | { kind: "error"; message: string };

/** "14 Nov", in Sydney. */
function sydneyDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Sydney",
  });
}

const VERIFY_FIRST = "Please verify your email address before accepting this invitation";

const secondaryButtonStyle = {
  ...authButtonStyle,
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

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
          choice?: boolean;
        } & Partial<Choice>;
        if (res.ok && body.joined) {
          setState({ kind: "joined" });
          window.location.href = "/dashboard";
        } else if (res.ok && body.choice) {
          setState({
            kind: "choice",
            step: "offer",
            choice: {
              orgName: body.orgName ?? "",
              role: body.role ?? "",
              ownWorkspaceName: body.ownWorkspaceName ?? "",
              expiresAt: body.expiresAt ?? "",
              ...(body.switchBlocked ? { switchBlocked: body.switchBlocked } : {}),
            },
          });
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

  async function switchWorkspace(choice: Choice) {
    setState({ kind: "choice", choice, step: "switching" });
    const res = await fetch(
      `/api/organizations/${orgId}/members/accept?token=${encodeURIComponent(token)}`,
      { method: "POST" },
    ).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string; joined?: boolean };
    if (res?.ok && body.joined) {
      window.location.href = "/dashboard";
      return;
    }
    setState({
      kind: "error",
      message: body?.error ?? "Switching didn't work. Please try again.",
    });
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
        {state.kind === "choice" && state.step === "offer" && (
          <p style={authTextStyle}>
            You&apos;re invited to join {state.choice.orgName} as {state.choice.role}. You&apos;re
            working in {state.choice.ownWorkspaceName} now.
          </p>
        )}
        {state.kind === "choice" && state.step === "offer" && state.choice.switchBlocked && (
          <AuthNotice tone="error">
            <span data-switch-blocked>{state.choice.switchBlocked}</span>
          </AuthNotice>
        )}
        {state.kind === "choice" && (state.step === "confirm" || state.step === "switching") && (
          <p style={authTextStyle} data-switch-warning>
            {state.choice.ownWorkspaceName} stays exactly as it is: its brands, audits, team and
            plan, including billing if it&apos;s on a paid plan. After switching you won&apos;t see
            it, and switching back isn&apos;t supported yet, so you&apos;d need to contact us to
            return to it.
          </p>
        )}
        {state.kind === "choice" && state.step === "not_now" && (
          <p style={authTextStyle}>
            Nothing has changed: you&apos;re still in {state.choice.ownWorkspaceName}. The
            invitation stays open until {sydneyDate(state.choice.expiresAt)}; open its link again to
            switch.
          </p>
        )}
        {state.kind === "wrong_account" && (
          <p style={authTextStyle} data-wrong-account>
            You&apos;re signed in as {maskEmail(email)}.{" "}
            {state.invitedAs
              ? `This invite is for ${state.invitedAs}.`
              : "This invite is for a different email address."}
          </p>
        )}
      </div>
      {state.kind === "choice" && state.step === "offer" && (
        <>
          <button
            type="button"
            onClick={() => setState({ ...state, step: "confirm" })}
            disabled={!!state.choice.switchBlocked}
            title={state.choice.switchBlocked}
            style={{ ...authButtonStyle, opacity: state.choice.switchBlocked ? 0.5 : 1 }}
          >
            Switch to {state.choice.orgName}
          </button>
          <button
            type="button"
            onClick={() => setState({ ...state, step: "not_now" })}
            style={secondaryButtonStyle}
          >
            Not now
          </button>
        </>
      )}
      {state.kind === "choice" && (state.step === "confirm" || state.step === "switching") && (
        <>
          <button
            type="button"
            onClick={() => switchWorkspace(state.choice)}
            disabled={state.step === "switching"}
            style={{ ...authButtonStyle, opacity: state.step === "switching" ? 0.5 : 1 }}
          >
            {state.step === "switching" ? "Switching…" : `Switch to ${state.choice.orgName}`}
          </button>
          <button
            type="button"
            onClick={() => setState({ ...state, step: "offer" })}
            disabled={state.step === "switching"}
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
        </>
      )}
      {state.kind === "choice" && state.step === "not_now" && (
        <p style={{ ...authTextStyle, marginTop: 16 }}>
          <Link href="/dashboard" style={linkStyle}>
            Back to {PRODUCT_NAME}
          </Link>
        </p>
      )}
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
