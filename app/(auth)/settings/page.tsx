import { SettingsIndex } from "@/components/domain/settings-index";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import { userCan } from "@/lib/governance/access-control";

export default async function SettingsPage() {
  // S03 part 5: Questions is listed with the other Account pages while agency_questions is on, for owners and admins.
  const currentUser = await getCurrentUser();
  const questionsSettings =
    !!currentUser &&
    (await isEnabled("agency_questions", currentUser.organizationId)) &&
    (await userCan(currentUser, "manage_brands"));
  return (
    <div style={{ padding: "28px 32px", maxWidth: 720 }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        Account
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 24px" }}>
        Your workspace's team, notification emails, report branding and plan.
      </p>
      <SettingsIndex questionsSettings={questionsSettings} />
    </div>
  );
}
