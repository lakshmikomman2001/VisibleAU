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
import { signOut } from "@/lib/auth/client";
import { SESSION_ENDED_PATH } from "@/lib/auth/paths";
import { requestWorkspace, WORKSPACE_NAME_MAX } from "@/lib/auth/workspace-errors";
import type { WorkspaceState } from "@/lib/auth/workspace-state";

const secondaryButtonStyle = {
  ...authButtonStyle,
  background: "transparent",
  color: "var(--text-primary)",
  border: "1px solid var(--border-default)",
};

export function NoWorkspaceClient({
  email,
  state,
  initialError,
}: {
  email: string;
  state: WorkspaceState;
  initialError: string | null;
}) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function run(body: { name: string } | { organizationId: string }) {
    setBusy(true);
    setError(null);
    const result = await requestWorkspace(body);
    if (result.ok) {
      window.location.href = "/dashboard";
      return;
    }
    if (result.code === "session_ended") {
      window.location.href = SESSION_ENDED_PATH;
      return;
    }
    setBusy(false);
    setError(result.message);
  }

  function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    void run({ name: workspaceName.trim() });
  }

  return (
    <SimpleAuthCard title="You're signed in, without a workspace">
      <p style={authTextStyle}>
        You&apos;re signed in as {email}, but this account isn&apos;t part of a workspace yet, so
        there&apos;s nothing to show.
      </p>
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      {state.kind === "linked" && (
        <>
          <p style={authTextStyle}>
            It belongs to <strong>{state.orgName}</strong>, but setting it up didn&apos;t finish.
          </p>
          <button
            type="button"
            onClick={() => void run({ organizationId: state.authOrgId })}
            disabled={busy}
            style={{ ...authButtonStyle, opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Opening…" : `Open ${state.orgName}`}
          </button>
          <p style={{ ...authTextStyle, marginTop: 24 }}>Or create a different workspace:</p>
        </>
      )}

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
          maxLength={WORKSPACE_NAME_MAX}
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          style={authInputStyle}
        />
        <button
          type="submit"
          disabled={busy || !workspaceName.trim()}
          style={{
            ...(state.kind === "linked" ? secondaryButtonStyle : authButtonStyle),
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Creating…" : "Create workspace"}
        </button>
        <p style={{ ...authTextStyle, fontSize: 13 }}>
          Were you invited to someone else&apos;s workspace? Open the link in their invitation email
          instead.
        </p>
      </form>

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
