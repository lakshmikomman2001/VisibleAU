import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";
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
        afterCreateOrganization: async ({ organization: org, member, user: _user }) => {
          const newOrgId = randomUUID();
          await serviceDb
            .insert(organizations)
            .values({
              id: newOrgId,
              clerkOrgId: org.id,
              name: org.name,
              tier: "free",
              region: "au",
            })
            .onConflictDoNothing();

          if (member?.userId) {
            const [orgRow] = await serviceDb
              .select()
              .from(organizations)
              .where(eq(organizations.clerkOrgId, org.id));

            if (orgRow) {
              await serviceDb.execute(
                sql`SELECT set_config('app.current_org_id', ${orgRow.id}, true)`,
              );
              await serviceDb
                .insert(users)
                .values({
                  clerkUserId: member.userId,
                  organizationId: orgRow.id,
                  email: "pending@sync.local",
                  name: "",
                  role: "owner",
                })
                .onConflictDoNothing();

              await serviceDb
                .insert(reportTemplates)
                .values({
                  organizationId: orgRow.id,
                  name: "Default Report",
                  templateType: "standard",
                  sections: [
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
                  ],
                  tone: "professional",
                  isDefault: true,
                })
                .onConflictDoNothing();

              try {
                const [internalUser] = await serviceDb
                  .select({ id: users.id })
                  .from(users)
                  .where(eq(users.clerkUserId, member.userId));

                if (internalUser) {
                  // Self-seeded owner row, not a real invite -- already
                  // accepted, so expiresAt is never consulted for it
                  // (members/accept/route.ts checks acceptedAt first);
                  // set to "now" since NOT NULL requires some value and
                  // there's no real invitation to expire.
                  const now = new Date();
                  await serviceDb
                    .insert(orgMembers)
                    .values({
                      organizationId: orgRow.id,
                      userId: internalUser.id,
                      role: "owner",
                      brandAccess: null,
                      expiresAt: now,
                      acceptedAt: now,
                      isActive: true,
                      invitedBy: internalUser.id,
                    })
                    .onConflictDoNothing();
                }
              } catch (e) {
                console.error(
                  `[S8-SEED] Failed to seed org_members owner for org ${orgRow.id}:`,
                  e,
                );
              }

              try {
                await recordDataResidency(orgRow.id);
              } catch (e) {
                console.error(`[DR-01] Failed to write residency for org ${orgRow.id}:`, e);
              }
            }
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
