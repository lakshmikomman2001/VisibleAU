import { engineNameList } from "@/lib/audit/engine-failure";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { type ModelDrift, modelDriftNote } from "@/lib/llm/model-drift";
import { type RenderedEmail, renderEmail } from "../layout";

const ENGINE_NAMES: Record<string, string> = { ...ENGINE_DISPLAY_NAMES };

/**
 * Sri's decision 6 (7 Nov) -- a provider answered an audit's questions with a different model than the one
 * asked for (lib/audit/model-drift-alert.ts). The "org" copy goes to the org's owners and admins, the
 * "operator" copy ([ops]) to PLATFORM_ADMIN_EMAILS -- the whole-engine-failure alert's pattern
 * (engine-total-failure.ts).
 */
export function modelDriftEmail(i: {
  audience: "org" | "operator";
  brandName: string;
  organizationName: string;
  auditNumber: number;
  drift: ModelDrift[];
  auditUrl: string;
}): RenderedEmail {
  const who = engineNameList([...new Set(i.drift.map((d) => d.engine))]);
  const notes = i.drift.map(modelDriftNote);
  const rows: Array<[string, string]> = i.drift.map((d) => [
    ENGINE_NAMES[d.engine] ?? d.engine,
    `${d.answered} instead of ${d.requested} (${d.answers} of ${d.engineAnswers} ${d.engineAnswers === 1 ? "answer" : "answers"})`,
  ]);
  return renderEmail({
    category: "alert",
    subject: `${i.audience === "operator" ? "[ops] " : ""}[${i.brandName}] ${who} answered with a different model in Audit #${i.auditNumber}`,
    preview: notes[0] ?? "",
    heading: `${who} answered with a different model in Audit #${i.auditNumber}`,
    blocks: [
      {
        kind: "headline",
        text: `We asked for one model, and the provider's response named another: ${notes.join("; ")}.`,
      },
      { kind: "table", columns: ["Engine", "Answered with"], rows },
      {
        kind: "paragraph",
        text: "The audit's results are counted from these answers as they came back. Its page and its PDF report say which model answered, so a comparison with an earlier audit can be read with that in mind.",
      },
      { kind: "button", label: "Open the audit", url: i.auditUrl },
      ...(i.audience === "operator"
        ? [{ kind: "note" as const, text: `Organisation: ${i.organizationName}.` }]
        : []),
    ],
    reason:
      i.audience === "operator"
        ? "You're on Vunnara's operator list, so you get every audit a provider answered with a different model."
        : "You're an owner or admin of this organisation, so you're told when an audit's answers came from a different model than the one asked for.",
  });
}
