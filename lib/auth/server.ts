import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { and, eq, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { organizations, orgMembers, reportTemplates, users } from "@/db/schema";
import * as authSchema from "@/db/schema/auth";
import {
  authEmailRateLimit,
  logAuthMessage,
  RESET_PASSWORD_TOKEN_SECONDS,
  runAfterResponse,
  sendPasswordResetEmail,
  sendVerificationEmailMessage,
  VERIFICATION_TOKEN_SECONDS,
} from "@/lib/auth/emails";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-rules";
import { PLACEHOLDER_EMAIL, workspaceOfAccount } from "@/lib/auth/profile";
import { authRateLimitRules } from "@/lib/auth/rate-limit-rules";
import { markAuthUserEmailVerified } from "@/lib/auth/verified-email";
import {
  alreadyInWorkspaceMessage,
  failureReason,
  logWorkspaceFailure,
  type WorkspaceStep,
  WorkspaceStepError,
} from "@/lib/auth/workspace-errors";
import { recordDataResidency } from "@/lib/governance";
import { DEFAULT_REPORT_SECTIONS as REPORT_PDF_DEFAULT_SECTIONS } from "@/lib/reports/report-sections";

export const auth = betterAuth({
  database: drizzleAdapter(serviceDb, {
    provider: "pg",
    schema: {
      user: authSchema.authUsers,
      session: authSchema.authSessions,
      account: authSchema.authAccounts,
      verification: authSchema.authVerifications,
      organization: authSchema.authOrganizations,
      member: authSchema.authMembers,
      invitation: authSchema.authInvitations,
      rateLimit: authSchema.authRateLimits,
    },
  }),

  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    // 3 Nov: no session until the address is verified. A session an account
    // already holds keeps working until it ends; the next sign-in sends the link
    // (sendOnSignIn below). Nobody was marked verified in bulk.
    requireEmailVerification: true,
    // The one rule, which the invite sign-up checks too (lib/auth/password-rules.ts).
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // better-auth's own default, stated so the email can say it.
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_SECONDS,
    sendResetPassword: sendPasswordResetEmail,
    // The link was emailed, so using it proves the address, which better-auth
    // doesn't record itself. And it ends every other session: if someone else
    // made this account with this address, they're out.
    onPasswordReset: async ({ user }) => markAuthUserEmailVerified(user.id),
    revokeSessionsOnPasswordReset: true,
  },

  // Reset and verification requests are rate-limited per address and IP.
  hooks: { before: authEmailRateLimit },

  // Live invite test follow-ups (8 Nov), part 5 -- better-auth's own limits (3 sign-in or sign-up attempts
  // per 10 seconds, 3 reset or verification requests a minute, per caller and route) were kept in each
  // serverless instance's memory, so a caller spread over N instances had N times the allowance. They're
  // kept in Postgres now (auth_rate_limits, migration 0140), which every instance shares. On in production,
  // as before; AUTH_RATE_LIMIT=on turns it on elsewhere (a test, or trying it locally).
  // 8 Nov (brand-feature locks and pricing claims, part 5): only the routes those rules guard keep a count,
  // per caller address; a request without one, and every other auth route, keeps none
  // (lib/auth/rate-limit-rules.ts). The daily cleanup deletes counts a day old (lib/auth/rate-limit-cleanup.ts).
  rateLimit: {
    enabled: process.env.NODE_ENV === "production" || process.env.AUTH_RATE_LIMIT === "on",
    storage: "database",
    customRules: authRateLimitRules(),
  },

  // Emails go out after the response (see runAfterResponse).
  advanced: { backgroundTasks: { handler: runAfterResponse } },

  // Masks the address better-auth logs for an unknown reset request.
  logger: { log: logAuthMessage },

  plugins: [
    organization({
      organizationHooks: {
        // Follow-ups from 6e27afc..01a6a8c, part 2: an account that already belongs to a workspace
        // can't make another -- through POST /api/auth/workspace (which checks first, lib/auth/workspace.ts)
        // or better-auth's own organization/create. Refused here, before better-auth writes anything:
        // no organisation, no member, and so no app workspace either.
        beforeCreateOrganization: async ({ user }) => {
          const home = await workspaceOfAccount(serviceDb, user.id);
          if (home) {
            throw new APIError("FORBIDDEN", {
              code: "ALREADY_IN_WORKSPACE",
              message: alreadyInWorkspaceMessage(home.name),
            });
          }
        },
        // Best effort here: a failure is logged and the create still
        // returns the organisation's id, so the explicit step that follows
        // every create (lib/auth/workspace.ts) finishes the same work and
        // reports which step failed. When it threw half-way, the create
        // failed after better-auth had already made the organisation,
        // leaving one with no app workspace and no way to finish it.
        afterCreateOrganization: async ({ organization: org, user }) => {
          try {
            await provisionAppWorkspace(
              {
                authOrgId: org.id,
                orgName: org.name,
                authUserId: user.id,
                email: user.email,
                name: user.name ?? "",
              },
              "hook",
            );
          } catch (e) {
            logWorkspaceFailure(
              e instanceof WorkspaceStepError ? e.step : "app_org",
              failureReason(e),
              "hook",
            );
          }
        },
      },
    }),
  ],

  emailVerification: {
    sendVerificationEmail: sendVerificationEmailMessage,
    sendOnSignIn: true,
    expiresIn: VERIFICATION_TOKEN_SECONDS,
    // Off on purpose. Someone could sign up with another person's address; if
    // opening the link signed that person in, they'd be working in an account
    // whose password somebody else knows. They sign in instead, or reset it.
    autoSignInAfterVerification: false,
  },
});

export type Session = typeof auth.$Infer.Session;
export type BetterAuthUser = typeof auth.$Infer.Session.user;

// DEMO-BLOCKER (1 Nov), part 5 point 5: the report PDF's optional
// sections, all included (lib/reports/report-sections.ts).
const DEFAULT_REPORT_SECTIONS = REPORT_PDF_DEFAULT_SECTIONS;

async function runStep<T>(step: WorkspaceStep, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw e instanceof WorkspaceStepError ? e : new WorkspaceStepError(step, failureReason(e));
  }
}

/**
 * The app's side of a better-auth organisation: its workspace (linked by
 * `organizations.clerk_org_id`), the creator's profile row with their real
 * address, their owner membership, the default report template and the
 * data-residency record. Safe to run again on a half-finished one: each
 * step finds what an earlier run made, and only adds what's missing. A
 * profile whose own workspace was closed moves into this one. Runs
 * one at a time per organisation (the create hook and the explicit step
 * after it both call it).
 */
export async function provisionAppWorkspace(
  input: {
    authOrgId: string;
    orgName: string;
    authUserId: string;
    email: string;
    name: string;
  },
  via: "route" | "hook" = "route",
): Promise<{ organizationId: string }> {
  const { orgRow, organizationId } = await serviceDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.authOrgId}))`);

    // Part 2: an account that already belongs to a workspace -- another one -- gets nothing made. This is
    // checked before the workspace row is written; the transaction holds everything after it, so a
    // failure at any step leaves no row, profile or membership behind.
    const home = await runStep("check_membership", () => workspaceOfAccount(tx, input.authUserId));
    if (home && home.clerkOrgId !== input.authOrgId) {
      throw new WorkspaceStepError(
        "check_membership",
        "already_in_workspace",
        "already_in_workspace",
        alreadyInWorkspaceMessage(home.name),
      );
    }

    const orgRow = await runStep("app_org", async () => {
      await tx
        .insert(organizations)
        .values({
          id: randomUUID(),
          clerkOrgId: input.authOrgId,
          name: input.orgName,
          tier: "free",
          region: "au",
        })
        .onConflictDoNothing({ target: organizations.clerkOrgId });
      const [row] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.clerkOrgId, input.authOrgId));
      if (!row) throw new WorkspaceStepError("app_org", "not_written");
      if (row.deletedAt) throw new WorkspaceStepError("app_org", "closed", "workspace_closed");
      return row;
    });
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgRow.id}, true)`);

    const profile = await runStep("app_user", async () => {
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.clerkUserId, input.authUserId));
      // Follow-ups from 6e27afc..01a6a8c, part 1: a profile elsewhere has no workspace by now (its own is
      // closed, or it was removed from it), or the check above refused.
      if (existing && existing.organizationId !== orgRow.id) {
        // It has no workspace: this one becomes its workspace, which it owns. The profile moves (its id
        // stays, so the history that refers to it stays its own).
        const [moved] = await tx
          .update(users)
          .set({
            organizationId: orgRow.id,
            role: "owner",
            email: existing.email === PLACEHOLDER_EMAIL ? input.email : existing.email,
            name: existing.name || input.name,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id))
          .returning();
        return moved;
      }
      if (existing && existing.organizationId === orgRow.id) {
        // Its profile is in this workspace already. Removed from it (an inactive membership), it can't
        // come back by finishing the organisation it once created: only an invite brings it back.
        const [membership] = await tx
          .select({ isActive: orgMembers.isActive })
          .from(orgMembers)
          .where(and(eq(orgMembers.organizationId, orgRow.id), eq(orgMembers.userId, existing.id)));
        if (membership && !membership.isActive) {
          throw new WorkspaceStepError("check_membership", "removed", "removed_from_workspace");
        }
      }
      if (existing) {
        if (existing.email === PLACEHOLDER_EMAIL) {
          await tx
            .update(users)
            .set({ email: input.email, name: existing.name || input.name, updatedAt: new Date() })
            .where(eq(users.id, existing.id));
        }
        return existing;
      }
      const [created] = await tx
        .insert(users)
        .values({
          clerkUserId: input.authUserId,
          organizationId: orgRow.id,
          email: input.email,
          name: input.name,
          role: "owner",
        })
        .returning();
      return created;
    });

    await runStep("owner_member", async () => {
      // Self-seeded owner row, not a real invite -- already accepted, so
      // expiresAt is never consulted for it (members/accept/route.ts checks
      // acceptedAt first); set to "now" since NOT NULL requires some value
      // and there's no real invitation to expire.
      const now = new Date();
      await tx
        .insert(orgMembers)
        .values({
          organizationId: orgRow.id,
          userId: profile.id,
          role: "owner",
          brandAccess: null,
          expiresAt: now,
          acceptedAt: now,
          isActive: true,
          invitedBy: profile.id,
        })
        .onConflictDoNothing();
    });

    await runStep("report_template", async () => {
      const [template] = await tx
        .select({ id: reportTemplates.id })
        .from(reportTemplates)
        .where(
          and(eq(reportTemplates.organizationId, orgRow.id), eq(reportTemplates.isDefault, true)),
        )
        .limit(1);
      if (template) return;
      await tx.insert(reportTemplates).values({
        organizationId: orgRow.id,
        name: "Default Report",
        templateType: "standard",
        sections: DEFAULT_REPORT_SECTIONS,
        tone: "professional",
        isDefault: true,
      });
    });

    return { orgRow, organizationId: orgRow.id };
  });

  if (organizationId === orgRow.id) {
    // Upserts, so a re-run only refreshes it; never blocks the workspace.
    try {
      await recordDataResidency(orgRow.id);
    } catch (e) {
      logWorkspaceFailure("residency", failureReason(e), via);
    }
  }
  return { organizationId };
}
