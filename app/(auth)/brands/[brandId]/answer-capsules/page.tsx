import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { CapsuleQuestionList } from "@/components/domain/technical/capsule-question-list";
import { db, setRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

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
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) notFound();

  const [techAudit] = await db
    .select({
      findings: technicalAudits.findings,
      scoreContent: technicalAudits.scoreContent,
      crawledAt: technicalAudits.crawledAt,
    })
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Answer Capsules"]} />
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
  const questions: QuestionRow[] = content?.questions ?? [];
  const total =
    questions.length > 0
      ? questions.length
      : (content?.answerCapsulesFound ?? 0) + (content?.answerCapsulesSuggested ?? 0);
  const found =
    questions.length > 0
      ? questions.filter((q) => q.hasCapsule).length
      : (content?.answerCapsulesFound ?? 0);
  const suggested = total - found;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Answer Capsules"]} />

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
          Question-based headings with 20-25 word direct answers help AI engines cite your content.
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
              fontSize: 28,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              color: "var(--text-primary)",
            }}
          >
            {total}
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
              fontSize: 28,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              color: "var(--success)",
            }}
          >
            {found}
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
              fontSize: 28,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              color: suggested > 0 ? "var(--warning)" : "var(--success)",
            }}
          >
            {suggested}
          </div>
        </div>
      </div>

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
            Re-run the technical audit to see per-question capsule data.
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
          An answer capsule is a 20-25 word direct answer immediately following a question-based H2
          or H3 heading. AI engines prefer content that starts with the answer, not a preamble.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Click &ldquo;Suggest Rewrite&rdquo; on any question that needs a capsule to generate an
          AI-written 20-25 word direct answer you can copy into your content.
        </p>
      </div>
    </div>
  );
}
