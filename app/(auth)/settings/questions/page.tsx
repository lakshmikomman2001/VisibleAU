import { notFound, redirect } from "next/navigation";
import { QuestionSettings } from "@/components/domain/questions/question-settings";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import { userCan } from "@/lib/governance/access-control";

/**
 * S03 part 5 (LLD 8.3.4; contract P05): Workspace -> Questions settings. Behind agency_questions: off, the route is the
 * app's existing 404 and the page isn't in the settings navigation. Owners and admins (manage_brands, the existing
 * settings rule); anyone else is told who can open it. The page loads its data itself (GET /api/settings/questions).
 */
export default async function QuestionSettingsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  if (!(await isEnabled("agency_questions", currentUser.organizationId))) notFound();
  if (!(await userCan(currentUser, "manage_brands"))) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          Questions
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
          Only owners and admins can open question settings.
        </p>
      </div>
    );
  }
  return <QuestionSettings />;
}
