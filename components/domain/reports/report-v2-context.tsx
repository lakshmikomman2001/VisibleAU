"use client";

import { createContext, type ReactNode, useContext } from "react";

/**
 * S01 part 8 (contract P08.states.loading, P17.states.flagOff): whether report_v2 is on for this workspace, read once
 * on the server by the Reports route's layout (app/(auth)/brands/[brandId]/reports/layout.tsx) and handed to the
 * page. On: "Generate report" opens the report contents panel at once, with its skeleton while its view loads. Off
 * (and outside the layout, as in component tests of the page): the page is exactly as before -- Generate starts
 * today's report directly.
 */
const ReportV2Context = createContext(false);

export function ReportV2Provider({ on, children }: { on: boolean; children: ReactNode }) {
  return <ReportV2Context.Provider value={on}>{children}</ReportV2Context.Provider>;
}

export function useReportV2(): boolean {
  return useContext(ReportV2Context);
}
