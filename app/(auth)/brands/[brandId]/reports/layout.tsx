import { ReportV2Provider } from "@/components/domain/reports/report-v2-context";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";

/**
 * S01 part 8 (contract P08.states.loading, P17.states.flagOff): reads report_v2 for the workspace once, on the server,
 * so the Reports page knows at load whether "Generate report" opens the report contents panel (on) or starts today's
 * report directly (off) -- with no extra request from the page. The brand layout above has already checked the
 * signed-in user's access to the brand. isEnabled never throws: if the settings can't be read the flag is off.
 */
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();
  const on = currentUser ? await isEnabled("report_v2", currentUser.organizationId) : false;
  return <ReportV2Provider on={on}>{children}</ReportV2Provider>;
}
