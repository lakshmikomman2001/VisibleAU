import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { withRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { META_WEIGHTS, type MetaFindings } from "@/lib/technical-audit/orchestrate";
import { isUuid } from "@/lib/validation/uuid";

// Task UU: weights come from the scorer (lib/technical-audit/orchestrate.ts)
// -- do not re-hardcode a second copy here, that's how this page's weights
// drifted to 3/3/3/3/2 against the real 4/3/3/2/2.
const SIGNALS = [
  { key: "titlePresent", label: "Title Tag", weight: META_WEIGHTS.title, desc: "Page <title> element" },
  {
    key: "descriptionPresent",
    label: "Meta Description",
    weight: META_WEIGHTS.description,
    desc: 'meta name="description"',
  },
  {
    key: "ogPresent",
    label: "Open Graph Tags",
    weight: META_WEIGHTS.og,
    desc: "og:title, og:description, og:image",
  },
  {
    key: "canonicalPresent",
    label: "Canonical URL",
    weight: META_WEIGHTS.canonical,
    desc: 'link rel="canonical"',
  },
  {
    key: "hreflangPresent",
    label: "Hreflang",
    weight: META_WEIGHTS.hreflang,
    desc: 'link rel="alternate" hreflang for AU locale',
  },
] as const;

/**
 * Task UU: the granular fields (descriptionLength, ogTitle/ogDesc/ogImage,
 * ...) were added together, in one deploy -- an audit either has all of
 * them (fresh) or none of them (legacy), never partial, so one check covers
 * every row that needs them.
 */
export function hasGranularMetaFields(
  findings: Partial<MetaFindings> | undefined,
): findings is MetaFindings {
  return typeof findings?.descriptionLength === "number" && typeof findings?.ogTitle === "boolean";
}

/**
 * Honest present-but-imperfect messaging for the two rows whose boolean
 * collapses a real middle state (task TT): a description that exists but is
 * the wrong length, or an Open Graph set missing only one of three tags.
 * Returns null for a genuinely-missing state (the static desc label already
 * says what's being checked) or when the row isn't one of these two.
 */
export function describeFailingMetaRow(key: string, findings: MetaFindings): string | null {
  if (key === "descriptionPresent" && !findings.descriptionPresent) {
    if (findings.descriptionVerdict === "too_long") {
      return `Present but too long — ${findings.descriptionLength} chars (aim for 50–160)`;
    }
    if (findings.descriptionVerdict === "too_short") {
      return `Present but too short — ${findings.descriptionLength} chars (aim for 50–160)`;
    }
    return null;
  }
  if (key === "ogPresent" && !findings.ogPresent) {
    const present = [
      findings.ogTitle && "og:title",
      findings.ogDesc && "og:description",
      findings.ogImage && "og:image",
    ].filter((v): v is string => Boolean(v));
    if (present.length === 0) return null;
    const missing = [
      !findings.ogTitle && "og:title",
      !findings.ogDesc && "og:description",
      !findings.ogImage && "og:image",
    ].filter((v): v is string => Boolean(v));
    return `${present.length} of 3 present — add ${missing.join(", ")}`;
  }
  return null;
}

export default async function MetaTagsPage({ params }: { params: Promise<{ brandId: string }> }) {
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
        scoreMeta: technicalAudits.scoreMeta,
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
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Meta Tags"]} />
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

  const findings = (techAudit.findings as Record<string, unknown>)?.meta as
    | Partial<MetaFindings>
    | undefined;
  const score = Number(techAudit.scoreMeta ?? 0);
  const granular = hasGranularMetaFields(findings);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Meta Tags"]} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 4px",
            }}
          >
            Meta Tags Audit
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            Title, description, OG, canonical &amp; hreflang &middot; Score: {score}/14
          </p>
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            color: "var(--text-primary)",
          }}
        >
          {score}/14
        </div>
      </div>

      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Tag Checks
          </h3>
          {!granular && (
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
              Per-component detail unavailable for this audit — re-run the audit to see it.
            </p>
          )}
        </div>
        {SIGNALS.map((sig) => {
          const present = findings?.[sig.key] ?? false;
          const message = granular ? describeFailingMetaRow(sig.key, findings as MetaFindings) : null;
          return (
            <div
              key={sig.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  color: present ? "var(--success)" : "var(--text-tertiary)",
                }}
              >
                {present ? "✓" : "✗"}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                  {sig.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {message ?? sig.desc}
                </div>
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  color: present ? "var(--success)" : "var(--text-tertiary)",
                }}
              >
                {present ? sig.weight : 0}/{sig.weight}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
