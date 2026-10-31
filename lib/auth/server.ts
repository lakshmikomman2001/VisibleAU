import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
} from "@/lib/auth/emails";
import { PLACEHOLDER_EMAIL } from "@/lib/auth/profile";
import {
  failureReason,
  logWorkspaceFailure,
  type WorkspaceStep,
  WorkspaceStepError,
} from "@/lib/auth/workspace-errors";
import { recordDataResidency } from "@/lib/governance";

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
    },
  }),

  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",

  emailAndPassword: {
    enabled: true,
    // Off on purpose: turning it on would stop every account whose
    // address isn't verified -- every existing one -- from signing in.
    requireEmailVerification: false,
    minPasswordLength: 8,
    // better-auth's own default, stated so the email can say it.
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_SECONDS,
    sendResetPassword: sendPasswordResetEmail,
  },

  // Reset and verification requests are rate-limited per address and IP.
  hooks: { before: authEmailRateLimit },

  // Emails go out after the response (see runAfterResponse).
  advanced: { backgroundTasks: { handler: runAfterResponse } },

  // Masks the address better-auth logs for an unknown reset request.
  logger: { log: logAuthMessage },

  plugins: [
    organization({
      organizationHooks: {
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
  },
});

export type Session = typeof auth.$Infer.Session;
export type BetterAuthUser = typeof auth.$Infer.Session.user;

const DEFAULT_REPORT_SECTIONS = [
  { type: "executive_summary", include: true },
  { type: "score_breakdown", include: true },
  { type: "mention_source_divide", include: true },
  { type: "fan_out_coverage", include: true },
  { type: "topical_gap_summary", include: true },
  { type: "source_type_gaps", include: false },
  { type: "agent_readiness", include: false },
  { type: "linkedin_performance", include: false },
  { type: "consensus_score", include: false },
  { type: "knowledge_panel_status", include: false },
  { type: "entity_home_status", include: false },
  { type: "evidence_snapshots", include: false },
];

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
      const [found] = await tx
        .select({ user: users, workspaceClosedAt: organizations.deletedAt })
        .from(users)
        .innerJoin(organizations, eq(users.organizationId, organizations.id))
        .where(eq(users.clerkUserId, input.authUserId));
      const existing = found?.user;
      if (existing && found?.workspaceClosedAt) {
        // Its workspace was closed, so it has none: this one becomes its
        // workspace, which it owns.
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

    // A profile that already lives in another workspace stays there.
    if (profile.organizationId !== orgRow.id) {
      return { orgRow, organizationId: profile.organizationId };
    }

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
