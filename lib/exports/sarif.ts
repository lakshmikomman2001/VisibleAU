import { PRODUCT_NAME, SITE_URL } from "@/lib/product";
import {
  type CiExportInput,
  NOT_MEASURED_TEXT,
  positionLine,
  sourceCitationLine,
  visibilityCheck,
} from "./ci-checks";

/**
 * Where each rule's help link goes: the methodology page, which says how each dimension is measured. They named
 * pages under the old domain's /docs/scoring, which never existed (9 Nov).
 */
const SCORING_HELP = `${SITE_URL}/methodology`;

/** Same rule IDs as before, in the same dimension order. */
const RULES = [
  {
    id: "VA001",
    name: "VisibilityMentionRate",
    shortDescription: { text: "How often AI answers to everyday questions mention the brand" },
    helpUri: SCORING_HELP,
  },
  {
    id: "VA002",
    name: "TypicalPosition",
    shortDescription: { text: "Typical rank when the brand is in a ranked list (informational)" },
    helpUri: SCORING_HELP,
  },
  {
    id: "VA003",
    name: "Sentiment",
    shortDescription: { text: "Tone of mentions (not yet measured)" },
    helpUri: SCORING_HELP,
  },
  {
    id: "VA004",
    name: "Context",
    shortDescription: { text: "Recommended vs listed (not yet measured)" },
    helpUri: SCORING_HELP,
  },
  {
    id: "VA005",
    name: "SourceCitation",
    shortDescription: { text: "How many mentions linked a source (informational)" },
    helpUri: SCORING_HELP,
  },
] as const;

export interface SarifAuditInput extends CiExportInput {
  id: string;
  brandId: string;
  createdAt: Date;
}

type SarifLevel = "error" | "warning" | "note";

/**
 * Only Visibility can be "error" (the app's "low" band) or "warning"
 * ("developing"; lib/exports/ci-checks.ts).
 * Typical position, Source citation, Sentiment and Context are always
 * "note" -- audit #36 follow-up: Position and Source citation used to be
 * 0-100 scores that could be "error". A Visibility that couldn't be
 * measured (too few answers) is a "note" saying why.
 */
export function buildSarif(audit: SarifAuditInput) {
  const location = {
    physicalLocation: {
      artifactLocation: {
        uri: `brand/${audit.brandId}`,
        uriBaseId: "%SRCROOT%",
      },
    },
  };
  const result = (ruleId: string, level: SarifLevel, text: string) => ({
    ruleId,
    level,
    message: { text },
    locations: [location],
  });

  const results = [];
  const visibility = visibilityCheck(audit);
  if (visibility.kind === "error" || visibility.kind === "warning") {
    results.push(result("VA001", visibility.kind, visibility.text));
  } else {
    results.push(result("VA001", "note", visibility.text));
  }
  results.push(result("VA002", "note", positionLine(audit)));
  results.push(result("VA003", "note", `Sentiment: ${NOT_MEASURED_TEXT}`));
  results.push(result("VA004", "note", `Context: ${NOT_MEASURED_TEXT}`));
  results.push(result("VA005", "note", sourceCitationLine(audit)));

  return {
    $schema: "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: PRODUCT_NAME,
            informationUri: SITE_URL,
            version: "1.0.0",
            rules: RULES,
          },
        },
        results,
        invocations: [{ executionSuccessful: true }],
      },
    ],
  };
}
