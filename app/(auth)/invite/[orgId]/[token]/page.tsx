"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";

/**
 * Where a team invite's email link lands (signed-in area: sign-in brings
 * you back here). Accepts through members/accept/route.ts, which needs
 * the account to be the one invited and its email address verified;
 * when it isn't verified yet, this offers to email a verification link
 * that comes back to this same page.
 */
type State =
  | { kind: "accepting" }
  | { kind: "accepted" }
  | { kind: "needs_verification"; sent: boolean }
  | { kind: "error"; message: string };

const VERIFY_FIRST = "Please verify your email address before accepting this invitation";

export default function AcceptInvitePage() {
  const { orgId, token } = useParams<{ orgId: string; token: string }>();
  const { data: session } = authClient.useSession();
  const [state, setState] = useState<State>({ kind: "accepting" });
  const started = useRef(false);

  useEffect(() => {
    // Accepting changes state, so do it once (dev mode runs effects twice).
    if (started.current) return;
    started.current = true;
    fetch(`/api/organizations/${orgId}/members/accept?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.ok) setState({ kind: "accepted" });
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
    const email = session?.user.email;
    if (!email) return;
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

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 32px" }}>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          margin: "0 0 12px",
        }}
      >
        Team invitation
      </h1>
      <div
        role="status"
        style={{ fontSize: 14, lineHeight: "22px", color: "var(--text-secondary)" }}
      >
        {state.kind === "accepting" && <p>Accepting the invitation…</p>}
        {state.kind === "accepted" && (
          <p>
            You&apos;ve joined the team.{" "}
            <Link href="/dashboard" style={{ color: "var(--accent-blue)" }}>
              Go to Overview
            </Link>
          </p>
        )}
        {state.kind === "needs_verification" &&
          (state.sent ? (
            <p>
              We&apos;ve emailed a verification link to {session?.user.email}. Open it and
              you&apos;ll come back here to finish accepting.
            </p>
          ) : (
            <>
              <p>Before you can accept, confirm that this email address is yours.</p>
              <button
                type="button"
                onClick={sendVerification}
                style={{
                  marginTop: 12,
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  background: "var(--accent-primary)",
                  color: "var(--accent-primary-fg)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Email me a verification link
              </button>
            </>
          ))}
        {state.kind === "error" && (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
