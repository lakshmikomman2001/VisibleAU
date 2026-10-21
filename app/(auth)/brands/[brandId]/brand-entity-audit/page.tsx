import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { VerifiedSource } from "@/components/domain/brand-entity/verified-source";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { withRlsContext } from "@/db/client";
import { brandEntityScores, brands, technicalAudits } from "@/db/schema";
import { BRAND_ENTITY_MAX_SCORE, BRAND_ENTITY_WEIGHTS } from "@/lib/brand-entity/score";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

// Task RRR: the real, live-verified public ABR Lookup page -- confirmed
// (curl, HTTP 200, "Current details for ABN ... | ABN Lookup") this is a
// genuine human-facing record, not the JSON API endpoint abn-lookup.ts
// itself calls.
function abrViewUrl(abn: string): string {
  return `https://abr.business.gov.au/ABN/View?abn=${abn.replace(/\s/g, "")}`;
}

// Task RRR: reconstructs the exact query checkWikipediaAu used
// (lib/brand-entity/wikipedia-au.ts), so a "not found" result still links
// to the real search a reader can run themselves -- live-verified
// (curl, HTTP 200, real Wikipedia search results page).
function wikipediaSearchUrl(brandName: string): string {
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${brandName} Australia`)}`;
}

interface BrandEntityFindings {
  score: number;
  abnVerified: boolean;
  abnNumber: string | null;
  abnStatus?: string | null;
  wikipediaAuPresent: boolean;
  wikipediaAuUrl?: string | null;
  auTldPresent: boolean;
  // Vunnara (21 Oct, "directory listings... never scraping", Part A3):
  // a historical row may still carry a directoryPresence array (the
  // now-deleted checkAuDirectories wrote it), deliberately left off this
  // type and never read -- that checker requested a page neither
  // hipages nor ServiceSeeking actually permitted, so none of its
  // values (old or new) are trustworthy. Directory presence now comes
  // only from the owner's own confirmation (brand_directory_listings,
  // Part C) or AI-answer citations (Part D), shown on their own
  // surfaces, never this one.
}

export default async function BrandEntityAuditPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const { brand, techAudit, entityScore } = await withRlsContext(
    currentUser.organizationId,
    async (tx) => {
      const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)).limit(1);
      if (!brand) notFound();

      const [techAudit] = await tx
        .select({
          findings: technicalAudits.findings,
          scoreBrandEntity: technicalAudits.scoreBrandEntity,
          crawledAt: technicalAudits.crawledAt,
        })
        .from(technicalAudits)
        .where(eq(technicalAudits.brandId, brandId))
        .orderBy(desc(technicalAudits.createdAt))
        .limit(1);

      // Task RRR: this query already existed but its result was discarded
      // (`_entityScore`) -- abnEntityName lives only here, not in
      // technicalAudits.findings, and is the strongest evidence for a
      // genuinely-verified ABN ("Verified ... -- Acme Plumbing Pty Ltd",
      // not just a bare ABN digit string).
      const [entityScore] = await tx
        .select()
        .from(brandEntityScores)
        .where(eq(brandEntityScores.brandId, brandId))
        .orderBy(desc(brandEntityScores.checkedAt))
        .limit(1);

      return { brand, techAudit, entityScore };
    },
  );

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Brand & Entity"]} />
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

  const findings = (techAudit.findings as Record<string, unknown>)?.brandEntity as
    | BrandEntityFindings
    | undefined;
  const score = Number(techAudit.scoreBrandEntity ?? 0);

  const abnSkipped = findings?.abnStatus === "check_skipped";

  // Task RRR: "No ABN verified" was ambiguous -- it hid three different
  // situations (never provided / provided but not Active / genuinely
  // verified). brand.abn (the raw input from brand setup) is the only way
  // to tell "not provided" apart from the other two; abnStatus then tells
  // "not matched" apart from "verified."
  const abnOnFile = brand.abn;
  let abnDetail: string;
  let abnSourceUrl: string | null = null;
  let abnSourceLabel: string | undefined;
  if (abnSkipped) {
    abnDetail = "Check temporarily unavailable — verification pending";
  } else if (!abnOnFile) {
    abnDetail = "No ABN on file — add it in brand settings to verify against the ABR";
  } else if (findings?.abnVerified) {
    abnDetail = entityScore?.abnEntityName
      ? `Verified on the Australian Business Register — ${entityScore.abnEntityName}`
      : `Verified on the Australian Business Register — ABN ${findings.abnNumber ?? abnOnFile}`;
    abnSourceUrl = abrViewUrl(findings.abnNumber ?? abnOnFile);
  } else if (findings?.abnStatus) {
    // A real ABR status came back, just not Active (e.g. Cancelled).
    abnDetail = `ABN ${findings.abnNumber ?? abnOnFile} isn't active on the ABR (status: ${findings.abnStatus})`;
    abnSourceUrl = abrViewUrl(findings.abnNumber ?? abnOnFile);
    abnSourceLabel = "View the ABR record";
  } else {
    // Provided, but the stored finding can't distinguish "not matched"
    // from "the check didn't complete" (missing GUID, malformed ABN,
    // network failure) -- PPP/RRR: default to the clearest honest wording
    // the data supports, and still link the ABR view for the number on
    // file so the reader can check it themselves.
    abnDetail = "ABN on file, but we couldn't verify it against the ABR";
    abnSourceUrl = abrViewUrl(abnOnFile);
    abnSourceLabel = "View the ABR record";
  }

  const wikipediaFound = findings?.wikipediaAuPresent ?? false;
  const wikipediaDetail = wikipediaFound
    ? "Found on Wikipedia"
    : "Checked Wikipedia — no Australian page found";
  const wikipediaSourceUrl = wikipediaFound
    ? (findings?.wikipediaAuUrl ?? null)
    : wikipediaSearchUrl(brand.name);
  const wikipediaSourceLabel = wikipediaFound ? "Found on Wikipedia" : "View Wikipedia search";

  // Task RRR: `source` drives the VerifiedSource line rendered under each
  // signal's detail -- null for signals with no external record to link
  // (AU TLD's "source" is the registered domain itself, already shown as
  // the detail text; the Directory Aggregate's links live in the per-row
  // breakdown table below, not on this summary card).
  const signals = [
    {
      label: "ABN Lookup Verification",
      present: findings?.abnVerified ?? false,
      skipped: abnSkipped,
      detail: abnDetail,
      earned: findings?.abnVerified ? BRAND_ENTITY_WEIGHTS.abnVerified : 0,
      max: BRAND_ENTITY_WEIGHTS.abnVerified,
      source:
        !abnSkipped && abnOnFile
          ? { name: "Australian Business Register", url: abnSourceUrl, label: abnSourceLabel }
          : null,
    },
    {
      label: "Wikipedia AU Presence",
      present: findings?.wikipediaAuPresent ?? false,
      skipped: false,
      detail: wikipediaDetail,
      earned: findings?.wikipediaAuPresent ? BRAND_ENTITY_WEIGHTS.wikipediaAuPresent : 0,
      max: BRAND_ENTITY_WEIGHTS.wikipediaAuPresent,
      source: { name: "Wikipedia", url: wikipediaSourceUrl, label: wikipediaSourceLabel },
    },
    {
      label: "Australian TLD (.com.au)",
      present: findings?.auTldPresent ?? false,
      skipped: false,
      detail: findings?.auTldPresent ? brand.domain : "No AU TLD detected",
      earned: findings?.auTldPresent ? BRAND_ENTITY_WEIGHTS.auTldPresent : 0,
      max: BRAND_ENTITY_WEIGHTS.auTldPresent,
      source: null,
    },
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Brand & Entity"]} />

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
            Brand &amp; Entity Audit
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 4px" }}>
            AU-localised brand presence signals &middot; Score: {score}/{BRAND_ENTITY_MAX_SCORE}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
            Every signal is checked against a public source — click through to verify.
          </p>
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            // Vunnara (21 Oct, Part A3): same 70%/40% breakpoints as
            // before, against the new /8 max (was /10) -- 0.7*8=5.6,
            // 0.4*8=3.2, rounded to whole-point thresholds.
            color: score >= 6 ? "var(--success)" : score >= 4 ? "var(--warning)" : "var(--danger)",
          }}
        >
          {score}/{BRAND_ENTITY_MAX_SCORE}
        </div>
      </div>

      {/* Signal Cards */}
      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Entity Signals
          </h3>
        </div>
        {signals.map((sig) => (
          <div
            key={sig.label}
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
                color: sig.skipped
                  ? "var(--warning)"
                  : sig.present
                    ? "var(--success)"
                    : "var(--danger)",
              }}
            >
              {sig.skipped ? "⏳" : sig.present ? "✓" : "✗"}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {sig.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: sig.skipped ? "var(--warning)" : "var(--text-tertiary)",
                }}
              >
                {sig.detail}
              </div>
              {sig.source && (
                <div style={{ marginTop: 2 }}>
                  <VerifiedSource
                    source={sig.source.name}
                    url={sig.source.url}
                    label={sig.source.label}
                  />
                </div>
              )}
            </div>
            <span
              style={{
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                color: sig.skipped
                  ? "var(--warning)"
                  : sig.present
                    ? "var(--success)"
                    : "var(--danger)",
              }}
            >
              {sig.skipped ? "—" : sig.earned}/{sig.max}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}
