"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AuthNotice,
  authButtonStyle,
  authInputStyle,
  authLabelStyle,
  authTextStyle,
  SimpleAuthCard,
} from "@/components/domain/auth/simple-auth-card";
import { authPagePath } from "@/lib/auth/paths";
import { PRODUCT_NAME } from "@/lib/product";

type Preview =
  | { orgName: string; role: string; forNewAccount: true; email: string }
  | { orgName: string; role: string; forNewAccount: false };

type State =
  | { kind: "checking" }
  | { kind: "ready"; invite: Preview }
  | { kind: "unusable"; message: string };

/**
 * Team follow-ups (31 Oct), item 4 -- the sign-up page for an invite link (/sign-up?redirectTo=/invite/...).
 * For an invite to an address with no account yet, the address is filled in and locked, and creating the
 * account joins the inviting workspace straight away (app/api/invites/[orgId]/[token]/sign-up): no workspace
 * of its own, no second email. An invite for an existing account says to sign in; one that's expired or used
 * says why.
 */
export function InviteSignUp({ orgId, token }: { orgId: string; token: string }) {
  const invitePath = `/invite/${orgId}/${token}`;
  const signInPath = authPagePath("/sign-in", invitePath);
  const [state, setState] = useState<State>({ kind: "checking" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; signIn: boolean } | null>(null);

  useEffect(() => {
    fetch(`/api/invites/${orgId}/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Partial<Preview> & { error?: string };
        if (res.ok && body.orgName && body.role)
          setState({ kind: "ready", invite: body as Preview });
        else
          setState({
            kind: "unusable",
            message: body.error ?? "This invitation can't be used.",
          });
      })
      .catch(() =>
        setState({
          kind: "unusable",
          message: "The invitation couldn't be checked. Reload the page to try again.",
        }),
      );
  }, [orgId, token]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "ready" || !state.invite.forNewAccount) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invites/${orgId}/${encodeURIComponent(token)}/sign-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: state.invite.email, password }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      signedIn?: boolean;
    };
    if (res?.ok) {
      window.location.href = body.signedIn ? "/dashboard" : authPagePath("/sign-in", "/dashboard");
      return;
    }
    setBusy(false);
    setError({
      message: body?.error ?? "Something went wrong. Please try again.",
      signIn: body?.code === "account_exists" || body?.code === "existing_account",
    });
  }

  const linkStyle = { color: "var(--accent-blue)" };
  const title =
    state.kind === "ready" ? `Join ${state.invite.orgName} on ${PRODUCT_NAME}` : "Team invitation";

  return (
    <SimpleAuthCard title={title}>
      {state.kind === "checking" && (
        <p role="status" style={authTextStyle}>
          Checking your invitation…
        </p>
      )}

      {state.kind === "unusable" && (
        <>
          <AuthNotice tone="error">{state.message}</AuthNotice>
          <p style={{ ...authTextStyle, marginTop: 16 }}>
            <Link href="/sign-in" style={linkStyle}>
              Sign in
            </Link>
          </p>
        </>
      )}

      {state.kind === "ready" && !state.invite.forNewAccount && (
        <>
          <p style={authTextStyle}>
            This invitation is for an existing {PRODUCT_NAME} account. Sign in to accept it.
          </p>
          <Link
            href={signInPath}
            style={{
              ...authButtonStyle,
              display: "block",
              textAlign: "center",
              lineHeight: "40px",
            }}
          >
            Sign in
          </Link>
        </>
      )}

      {state.kind === "ready" && state.invite.forNewAccount && (
        <form
          onSubmit={createAccount}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <p style={authTextStyle}>
            You&apos;ve been invited to join {state.invite.orgName} as {state.invite.role}. Create
            your account to accept.
          </p>
          {error && (
            <AuthNotice tone="error">
              {error.message}{" "}
              {error.signIn && (
                <Link href={signInPath} style={linkStyle}>
                  Sign in
                </Link>
              )}
            </AuthNotice>
          )}
          <label htmlFor="invite-email" style={authLabelStyle}>
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={state.invite.email}
            readOnly
            aria-readonly="true"
            style={{ ...authInputStyle, opacity: 0.75 }}
          />
          <label htmlFor="invite-name" style={authLabelStyle}>
            Full name
          </label>
          <input
            id="invite-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            style={authInputStyle}
          />
          <label htmlFor="invite-password" style={authLabelStyle}>
            Password
          </label>
          <input
            id="invite-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            style={authInputStyle}
          />
          <button
            type="submit"
            disabled={busy}
            style={{ ...authButtonStyle, opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Creating your account…" : `Create account and join ${state.invite.orgName}`}
          </button>
          <p style={{ ...authTextStyle, fontSize: 13 }}>
            Already have an account?{" "}
            <Link href={signInPath} style={linkStyle}>
              Sign in
            </Link>
          </p>
        </form>
      )}
    </SimpleAuthCard>
  );
}
