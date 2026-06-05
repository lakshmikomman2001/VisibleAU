import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, users } from "@/db/schema";
import * as authSchema from "@/db/schema/auth";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
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
    requireEmailVerification: false,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      console.log(`\n[AUTH EMAIL] Password reset for ${user.email}`);
      console.log(`[AUTH EMAIL] Click: ${url}\n`);
    },
  },

  plugins: [
    organization({
      organizationHooks: {
        afterCreateOrganization: async ({ organization: org, member, user: _user }) => {
          const newOrgId = randomUUID();
          await db
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
            const [orgRow] = await db
              .select()
              .from(organizations)
              .where(eq(organizations.clerkOrgId, org.id));

            if (orgRow) {
              await db.execute(sql`SELECT set_config('app.current_org_id', ${orgRow.id}, true)`);
              await db
                .insert(users)
                .values({
                  clerkUserId: member.userId,
                  organizationId: orgRow.id,
                  email: "pending@sync.local",
                  name: "",
                  role: "owner",
                })
                .onConflictDoNothing();
            }
          }
        },
      },
    }),
  ],

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`\n[AUTH EMAIL] Verify email for ${user.email}`);
      console.log(`[AUTH EMAIL] Click: ${url}\n`);
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type BetterAuthUser = typeof auth.$Infer.Session.user;
