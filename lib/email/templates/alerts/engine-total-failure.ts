import { engineNameList } from "@/lib/audit/engine-failure";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { type RenderedEmail, renderEmail } from "../layout";

const ENGINE_NAMES: Record<string, string> = { ...ENGINE_DISPLAY_NAMES };

export interface EngineTotalFailureEmailEngine {
  engine: string;
  /** e.g. "Provider error: account/credit issue". */
  reasonLabel: string;
  reasonCheck: string;
  errorClass: string;
  statusCode: number | null;
}

/**
 * URGENT audit #37 (31 Oct), item 2 -- every call to at least one engine
 * failed. Goes to the org's owner and to the operator
 * (PLATFORM_ADMIN_EMAILS). Never carries a provider's raw message: the
 * reason is lib/audit/engine-failure.ts's plain label, and the operator
 * copy adds only the error class and HTTP status.
 */
export function engineTotalFailureEmail(i: {
  audience: "owner" | "operator";
  brandName: string;
  organizationName: string;
  auditNumber: number;
  sentence: string;
  engines: EngineTotalFailureEmailEngine[];
  auditUrl: string;
}): RenderedEmail {
  const who = engineNameList(i.engines.map((e) => e.engine));
  const rows: Array<[string, string]> = i.engines.map((e) => [
    ENGINE_NAMES[e.engine] ?? e.engine,
    i.audience === "operator"
      ? `${e.reasonLabel} (${e.errorClass}${e.statusCode !== null ? `, HTTP ${e.statusCode}` : ""})`
      : e.reasonLabel,
  ]);
  const checks = [...new Set(i.engines.map((e) => e.reasonCheck))];
  return renderEmail({
    category: "alert",
    subject: `${i.audience === "operator" ? "[ops] " : ""}[${i.brandName}] ${who} returned an error for every question in Audit #${i.auditNumber}`,
    preview: i.sentence,
    heading: `${who} failed in Audit #${i.auditNumber}`,
    blocks: [
      { kind: "headline", text: i.sentence },
      { kind: "table", columns: ["Engine", "What went wrong"], rows },
      ...checks.map((text) => ({ kind: "paragraph" as const, text })),
      {
        kind: "paragraph",
        text: "Drift alerts and the weekly trend leave this audit out. Run it again once the engine answers.",
      },
      { kind: "button", label: "Open the audit", url: i.auditUrl },
      ...(i.audience === "operator"
        ? [{ kind: "note" as const, text: `Organisation: ${i.organizationName}.` }]
        : []),
    ],
    reason:
      i.audience === "operator"
        ? "You're on Vunnara's operator list, so you get every whole-engine failure."
        : "You own this organisation, so you're told when an audit's numbers are missing an engine.",
  });
}
