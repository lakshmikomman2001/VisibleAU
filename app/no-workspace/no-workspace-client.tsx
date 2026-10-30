"use client";

import { useState } from "react";
import {
  AuthNotice,
  authButtonStyle,
  authInputStyle,
  authLabelStyle,
  authTextStyle,
  SimpleAuthCard,
} from "@/components/domain/auth/simple-auth-card";
import { organization, signOut } from "@/lib/auth/client";
import { workspaceSlug } from "@/lib/auth/paths";
import type { WorkspaceState } from "@/lib/auth/workspace-state";

const secondaryButtonStyle = {
  ...authButtonStyle,
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

/** Sign-up's last step: write this account's profile into its workspace. */
async function connectProfile(): Promise<boolean> {
  const res = await fetch("/api/auth/sync-user", { method: "POST" });
  return res.ok;
}

export function NoWorkspaceClient({ email, state }: { email: string; state: WorkspaceState }) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reconnect() {
    setBusy(true);
    setError(null);
    if (await connectProfile()) {
      window.location.href = "/dashboard";
      return;
    }
    setBusy(false);
    setError("Your workspace couldn't be opened. Please try again, or contact support.");
  }

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const created = await organization.create({
      name: workspaceName.trim(),
      slug: workspaceSlug(workspaceName, crypto.randomUUID().slice(0, 6)),
    });
    if (created.error || !(await connectProfile())) {
      setBusy(false);
      setError("The workspace couldn't be created. Please try again.");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <SimpleAuthCard title="You're signed in, without a workspace">
      <p style={authTextStyle}>
        You&apos;re signed in as {email}, but this account isn&apos;t part of a workspace yet, so
        there&apos;s nothing to show.
      </p>
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      {state.kind === "linked" ? (
        <>
          <p style={authTextStyle}>
            It belongs to <strong>{state.orgName}</strong>, but setting it up didn&apos;t finish.
          </p>
          <button
            type="button"
            onClick={reconnect}
            disabled={busy}
            style={{ ...authButtonStyle, opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Opening…" : `Open ${state.orgName}`}
          </button>
        </>
      ) : (
        <form
          onSubmit={createWorkspace}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <label htmlFor="workspace-name" style={authLabelStyle}>
            Name your workspace (your agency or business)
          </label>
          <input
            id="workspace-name"
            required
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            style={authInputStyle}
          />
          <button
            type="submit"
            disabled={busy || !workspaceName.trim()}
            style={{ ...authButtonStyle, opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Creating…" : "Create workspace"}
          </button>
          <p style={{ ...authTextStyle, fontSize: 13 }}>
            Were you invited to someone else&apos;s workspace? Open the link in their invitation
            email instead.
          </p>
        </form>
      )}

      <button
        type="button"
        onClick={() =>
          signOut({
            fetchOptions: {
              onSuccess: () => {
                window.location.href = "/sign-in";
              },
            },
          })
        }
        style={{ ...secondaryButtonStyle, marginTop: 24 }}
      >
        Sign out
      </button>
    </SimpleAuthCard>
  );
}
