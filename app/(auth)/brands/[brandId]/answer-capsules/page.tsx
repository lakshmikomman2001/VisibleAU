import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { CapsuleQuestionList } from "@/components/domain/technical/capsule-question-list";
import { SiteUnreachableNotice } from "@/components/domain/technical/site-unreachable-notice";
import { withRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { ANSWER_CAPSULE_WORDS } from "@/lib/answer-capsules/find-questions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandCrumb, CRUMB } from "@/lib/navigation/breadcrumbs";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import { NOT_MEASURED } from "@/lib/scoring/measured";
import { crawlReach } from "@/lib/technical-audit/crawl-status";
import { isUuid } from "@/lib/validation/uuid";

// Task NNN: the word range comes from the detector (ANSWER_CAPSULE_WORDS) --
// this is the same drift this page already caused once, where the UI's
// stated range didn't match what the check actually enforced on the wrong
// measurement entirely.
const CAPSULE_RANGE_LABEL = `${ANSWER_CAPSULE_WORDS.min}-${ANSWER_CAPSULE_WORDS.max}`;

interface QuestionRow {
  heading: string;
  hasCapsule: boolean;
  excerpt: string;
}

interface ContentFindings {
  score: number;
  wordCount: number;
  answerCapsulesFound: number;
  answerCapsulesSuggested: number;
  questions?: QuestionRow[];
  capsuleFinding: string | null;
  negativeSignals: unknown[];
  promptInjections: unknown[];
}

export default async function AnswerCapsulesPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const { brand, techAudit } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) notFound();

    const [techAudit] = await tx
      .select({
        findings: technicalAudits.findings,
        scoreContent: technicalAudits.scoreContent,
        crawledAt: technicalAudits.crawledAt,
      })
      .from(technicalAudits)
      .where(eq(technicalAudits.brandId, brandId))
      .orderBy(desc(technicalAudits.createdAt))
      .limit(1);

    return { brand, techAudit };
  });

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs
          crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "Answer Capsules" }]}
        />
        <div
          style={{
            padding: 48,
            textAlign: "center",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            Run a technical audit first.
          </p>
        </div>
      </div>
    );
  }

  const content = (techAudit.findings as Record<string, unknown>)?.content as
    | ContentFindings
    | undefined;
  // Task NNN: distinguish "we computed zero questions" (questions is a real,
  // present [] -- show the honest capsuleFinding) from "this audit predates
  // the questions field" (content?.questions is undefined -- still ask for
  // a re-run, since there's genuinely nothing computed to show).
  const hasQuestionsField = content?.questions !== undefined;
  const questions: QuestionRow[] = content?.questions ?? [];
  // 17 Nov, part 3: the three counts only when the audit computed them. An audit from before per-question data
  // (no `questions`), or one whose crawl never reached the site, read 0 / 0 / 0 with a green "Need 0".
  const reach = crawlReach(techAudit.findings);
  const unreached = reach.kind === "unreached";
  const counted = hasQuestionsField && !unreached;
  const crawledOn = techAudit.crawledAt
    ? new Date(techAudit.crawledAt).toLocaleDateString("en-AU", {
        timeZone: getOrgTimezone(currentUser.organizationId),
      })
    : null;
  const total = questions.length;
  const found = questions.filter((q) => q.hasCapsule).length;
  const suggested = total - found;
  const notCountedText = unreached ? "Not checked" : NOT_MEASURED;
  const tile = (n: number) => (counted ? String(n) : notCountedText);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs
        crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "Answer Capsules" }]}
      />

      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 4px",
          }}
        >
          Answer Capsules
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          Question-based headings with {CAPSULE_RANGE_LABEL} word direct answers help AI engines
          cite your content.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: 20,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
            Total Questions
          </div>
          <div
            style={{
              fontSize: counted ? 28 : 13,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              color: counted ? "var(--text-primary)" : "var(--text-tertiary)",
            }}
          >
            {tile(total)}
          </div>
        </div>
        <div
          style={{
            padding: 20,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
            With Capsules
          </div>
          <div
            style={{
              fontSize: counted ? 28 : 13,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              color: counted && found > 0 ? "var(--success)" : "var(--text-tertiary)",
            }}
          >
            {tile(found)}
          </div>
        </div>
        <div
          style={{
            padding: 20,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
            Need Capsules
          </div>
          <div
            style={{
              fontSize: counted ? 28 : 13,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              // Green only for questions that all have capsules -- not for "no questions at all".
              color: !counted
                ? "var(--text-tertiary)"
                : suggested > 0
                  ? "var(--warning)"
                  : total > 0
                    ? "var(--success)"
                    : "var(--text-primary)",
            }}
          >
            {tile(suggested)}
          </div>
        </div>
      </div>

      {reach.kind === "unreached" && (
        <SiteUnreachableNotice
          domain={brand.domain}
          checkedOn={crawledOn}
          httpStatus={reach.httpStatus}
        />
      )}

      {questions.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <CapsuleQuestionList questions={questions} brandId={brandId} />
        </div>
      ) : (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            marginBottom: 24,
          }}
        >
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
            {unreached
              ? "No page was read on this audit, so no heading was checked."
              : hasQuestionsField
                ? (content?.capsuleFinding ??
                  "We checked your H2/H3 headings and found no question-style headings.")
                : "Re-run the technical audit to see per-question capsule data."}
          </p>
        </div>
      )}

      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          padding: 20,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 12px",
          }}
        >
          What is an Answer Capsule?
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" }}>
          An answer capsule is a {CAPSULE_RANGE_LABEL} word direct answer immediately following a
          question-based H2 or H3 heading. AI engines prefer content that starts with the answer,
          not a preamble.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Click &ldquo;Suggest Rewrite&rdquo; on any question that needs a capsule to generate an
          AI-written {CAPSULE_RANGE_LABEL} word direct answer you can copy into your content.
        </p>
      </div>
    </div>
  );
}
