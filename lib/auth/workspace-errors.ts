/**
 * Creating a workspace, shared by the server (lib/auth/workspace.ts and
 * the provisioning in lib/auth/server.ts) and the pages that ask for one
 * (/sign-up, /no-workspace). No server imports, so the pages can use it.
 *
 * Every failure has a code with a message the person can act on -- never
 * a bare status -- and the server logs `workspace_create_failed` with the
 * step that failed and a reason code. Neither holds names, addresses or ids.
 */

export const WORKSPACE_ERROR_CODES = [
  "invalid_name",
  "name_taken",
  "not_owner",
  "workspace_closed",
  "session_ended",
  "server_error",
] as const;
export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR_CODES)[number];

const MESSAGES: Record<WorkspaceErrorCode, string> = {
  invalid_name: "Enter a workspace name of up to 80 characters.",
  name_taken: "That name is taken. Try another.",
  not_owner:
    "This workspace was set up by another account. Sign out, then sign in with the account that created it.",
  workspace_closed: "That workspace has been closed. Create a new one instead.",
  session_ended: "Your session ended. Please sign in again.",
  server_error:
    "Something went wrong on our side, and we've logged it. Please try again in a minute.",
};

export const WORKSPACE_ERROR_STATUS: Record<WorkspaceErrorCode, number> = {
  invalid_name: 400,
  name_taken: 409,
  not_owner: 403,
  workspace_closed: 410,
  session_ended: 401,
  server_error: 500,
};

export function isWorkspaceErrorCode(code: unknown): code is WorkspaceErrorCode {
  return (WORKSPACE_ERROR_CODES as readonly unknown[]).includes(code);
}

export function workspaceErrorMessage(code: unknown): string {
  return MESSAGES[isWorkspaceErrorCode(code) ? code : "server_error"];
}

export const WORKSPACE_NAME_MAX = 80;

export type WorkspaceResult =
  | { ok: true; organizationId: string }
  | { ok: false; code: WorkspaceErrorCode };

/**
 * The pages' side: create a workspace by name, or finish setting up the
 * better-auth organisation with this id. Resolves, never throws.
 */
export async function requestWorkspace(
  body: { name: string } | { organizationId: string },
): Promise<{ ok: true } | { ok: false; code: WorkspaceErrorCode; message: string }> {
  const path = "name" in body ? "/api/auth/workspace" : "/api/auth/sync-user";
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as { code?: unknown } | null;
    const code = isWorkspaceErrorCode(json?.code) ? json.code : "server_error";
    return { ok: false, code, message: workspaceErrorMessage(code) };
  } catch {
    return { ok: false, code: "server_error", message: workspaceErrorMessage("server_error") };
  }
}

/** The steps, in order, that making a workspace goes through. */
export type WorkspaceStep =
  | "validate"
  | "check_membership"
  | "create_auth_org"
  | "app_org"
  | "app_user"
  | "owner_member"
  | "report_template"
  | "residency";

/** A step that failed, with the reason code to log. */
export class WorkspaceStepError extends Error {
  constructor(
    readonly step: WorkspaceStep,
    readonly reason: string,
    readonly code: WorkspaceErrorCode = "server_error",
  ) {
    super(`workspace step ${step} failed: ${reason}`);
    this.name = "WorkspaceStepError";
  }
}

/**
 * A reason code for any thrown value, without its message (which can hold
 * names or SQL): a Postgres SQLSTATE, a better-auth error code, or
 * "unexpected".
 */
export function failureReason(error: unknown): string {
  if (error instanceof WorkspaceStepError) return error.reason;
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; body?: { code?: unknown }; cause?: unknown };
    if (typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code)) {
      return `pg_${value.code}`;
    }
    if (typeof value.body?.code === "string") return `auth_${value.body.code.toLowerCase()}`;
    current = value.cause;
  }
  return "unexpected";
}

export function logWorkspaceFailure(
  step: WorkspaceStep,
  reason: string,
  via: "route" | "hook",
): void {
  console.error(JSON.stringify({ event: "workspace_create_failed", step, reason, via }));
}
