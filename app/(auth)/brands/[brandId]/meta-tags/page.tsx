import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

interface MetaFindings {
  score: number;
  titlePresent: boolean;
  descriptionPresent: boolean;
  ogPresent: boolean;
  canonicalPresent: boolean;
  hreflangPresent: boolean;
}

const SIGNALS = [
  { key: "titlePresent", label: "Title Tag", pts: 3, desc: "Page <title> element" },
  { key: "descriptionPresent", label: "Meta Description", pts: 3, desc: 'meta name="description"' },
  {
    key: "ogPresent",
    label: "Open Graph Tags",
    pts: 3,
    desc: "og:title, og:description, og:image",
  },
  { key: "canonicalPresent", label: "Canonical URL", pts: 3, desc: 'link rel="canonical"' },
  {
    key: "hreflangPresent",
    label: "Hreflang",
    pts: 2,
    desc: 'link rel="alternate" hreflang for AU locale',
  },
] as const;

export default async function MetaTagsPage({ params }: { params: Promise<{ brandId: string }> }) {
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
      scoreMeta: technicalAudits.scoreMeta,
      crawledAt: technicalAudits.crawledAt,
    })
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

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
    | MetaFindings
    | undefined;
  const score = Number(techAudit.scoreMeta ?? 0);

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
        </div>
        {SIGNALS.map((sig) => {
          const present = findings?.[sig.key] ?? false;
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
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{sig.desc}</div>
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  color: present ? "var(--success)" : "var(--text-tertiary)",
                }}
              >
                {present ? sig.pts : 0}/{sig.pts}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
