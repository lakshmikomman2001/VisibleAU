import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL!,
  },
  tablesFilter: [
    "!auth_users",
    "!auth_sessions",
    "!auth_accounts",
    "!auth_verifications",
    "!auth_organizations",
    "!auth_members",
    "!auth_invitations",
  ],
} satisfies Config;
