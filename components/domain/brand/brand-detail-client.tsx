"use client";

import {
  Activity,
  Bot,
  Calendar,
  Code,
  Compass,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  GitBranch,
  Hash,
  Lock,
  MapPin,
  MessageCircle,
  MonitorDot,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClassificationConfirmCard } from "@/components/domain/brand/classification-confirm-card";
import { LocationConfirmCard } from "@/components/domain/brand/location-confirm-card";
import { isTierAtLeast } from "@/lib/brands";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { formatLocation } from "@/lib/verticals/expand-prompt";

// engineStats' `engine` field is a plain string (not a typed Engine
// union), so call sites below index this by a bare `string` -- a
// string-indexed re-declaration over the one shared Engine->label map
// (lib/llm/interface.ts) rather than casting at every call site.
const ENGINE_DISPLAY: Record<string, string> = { ...ENGINE_DISPLAY_NAMES };

interface BrandDetailClientProps {
  brand: {
    id: string;
    name: string;
    domain: string;
    vertical: string;
    region: string;
    competitors: string[];
    primaryRegions: string[];
    // Vunnara Build 1, Part D: optional so existing callers/tests that
    // don't pass location state at all keep type-checking (treated as
    // already confirmed, like classificationStatus below). A real
    // brand from the server page always sends either an ISO string or
    // an explicit `null` -- never undefined -- and `null` is exactly
    // the "not confirmed yet" state the Part D.4 banner looks for.
    locationConfirmedAt?: string | null;
    // Vunnara Build 1, Part C: optional so existing callers/tests that
    // don't pass classification state keep type-checking -- missing
    // means "treat as already confirmed" (the pre-existing behaviour),
    // never a silent new requirement.
    classificationStatus?: "pending" | "processing" | "complete" | "failed" | "needs_confirmation";
    classificationError?: string | null;
    // Vunnara hotfix (18 Oct, post-df27ef8): the OWNER'S OWN confirmed
    // audience (brands.audience) -- distinct from classification.
    // audience below, which is the classifier's unconfirmed guess.
    // Optional/nullable so existing callers/tests keep type-checking;
    // missing or null means "not confirmed yet".
    audience?: "households" | "businesses" | "both" | null;
    classification?: {
      category: string;
      buyerType: string;
      audience?: "households" | "businesses" | "both";
      competitors: string[];
      confidence: number;
    } | null;
  };
  isFree?: boolean;
  tier?: string;
  auditCount: number;
  // Task #46 Phase 2: `insufficientData` is optional (not just `boolean`) so
  // existing callers/tests that don't yet pass it (e.g. an empty
  // recentAudits array, or a pre-fix fixture) keep type-checking -- a
  // missing flag is treated as "not insufficient" (the pre-existing
  // behaviour), never as a silent new requirement.
  recentAudits: Array<{
    scoreComposite: string | null;
    completedAt: string | null;
    insufficientData?: boolean;
    // Vunnara Build 1, Part E.2: optional so existing callers/tests
    // that don't pass it keep type-checking -- missing means "treat as
    // unchanged" (no marker), the same backward-compat rule
    // classificationStatus/locationConfirmedAt already use above.
    promptPackVersion?: number | null;
    // Vunnara Build 1, Part G.7: same backward-compat rule, for a
    // methodology (memory-only vs web-grounded) change.
    methodologyVersion?: number | null;
  }>;
  latestAudit: { scoreComposite: string | null; insufficientData?: boolean } | null;
  avgPosition: number | null;
  totalMentions: number;
  engineStats: Array<{ engine: string; total: number; mentions: number }>;
}

export function BrandDetailClient({
  brand,
  isFree,
  tier,
  auditCount,
  recentAudits,
  latestAudit,
  avgPosition,
  totalMentions,
  engineStats,
}: BrandDetailClientProps) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);
  const [name, setName] = useState(brand.name);
  const [domain, setDomain] = useState(brand.domain);
  const [vertical, setVertical] = useState(brand.vertical);
  const [retrying, setRetrying] = useState(false);

  // Vunnara Build 1, Part C.5: running an audit on an unconfirmed
  // classification isn't blocked -- just warned about -- so a brand
  // with no classificationStatus passed at all (existing callers/tests)
  // is treated as already confirmed, never as a silent new requirement.
  const classificationStatus = brand.classificationStatus ?? "complete";
  const needsConfirmation = classificationStatus === "needs_confirmation";
  const classificationFailed = classificationStatus === "failed";
  const classificationInProgress =
    classificationStatus === "pending" || classificationStatus === "processing";

  // Vunnara Build 1, Part D.4: an explicit `null` (every real brand
  // predating this feature -- no prod backfill ever set it) means
  // "needs confirmation." A genuinely missing prop (old callers/tests
  // that don't know this field exists at all) is treated as already
  // confirmed, the same backward-compat rule classificationStatus
  // uses above -- `??` would collapse null into that same default and
  // silently hide the banner for every real unconfirmed brand, so the
  // undefined/null distinction has to stay explicit here.
  const locationNeedsConfirmation =
    brand.locationConfirmedAt === undefined ? false : !brand.locationConfirmedAt;
  const isLegacyDefaultRegion =
    brand.primaryRegions.length === 1 && brand.primaryRegions[0] === "NSW:Sydney CBD";

  // Build 1 addendum, item 9 + 10: Part C.5's original design let an
  // unconfirmed brand run anyway, with only a warning -- that silently
  // ran generic or stale-classification questions, never visibly
  // different from a normal, tailored audit. Required behaviour per
  // the addendum: block, with a clear call to action, rather than
  // silently falling back. needsConfirmation itself is now also
  // re-derived at read time against TODAY's confirmation bar (item 10
  // -- see lib/brands/needs-confirmation.ts), so an Omega-shaped brand
  // (category not a real enum key, or confidence < 0.7, classified
  // "complete" by the OLD classifier) is blocked here too, not just a
  // brand explicitly marked needs_confirmation.
  const blockedFromAudit = needsConfirmation || locationNeedsConfirmation;

  // Vunnara hotfix (18 Oct, post-df27ef8): both confirm cards already
  // call router.refresh() on success, so the page's own data (and this
  // blockedFromAudit flag) already updates without the owner having to
  // hit a browser refresh -- but nothing told them it worked. Each
  // card sets a sessionStorage flag just before refreshing; once this
  // component re-renders with blockedFromAudit now false, it shows a
  // one-time "Thanks" banner for whichever confirmation flow just
  // finished, then clears the flag so a later, unrelated page load
  // never shows it again.
  const [justConfirmedSuccess, setJustConfirmedSuccess] = useState(false);
  useEffect(() => {
    if (blockedFromAudit) return;
    try {
      const key = `brand-just-confirmed-${brand.id}`;
      if (sessionStorage.getItem(key)) {
        sessionStorage.removeItem(key);
        setJustConfirmedSuccess(true);
      }
    } catch {
      // sessionStorage unavailable (private mode, restricted context) --
      // the confirm flow itself already worked; only this one-time
      // banner is skipped.
    }
  }, [blockedFromAudit, brand.id]);

  const handleRetryClassification = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/brands/${brand.id}/retry-classification`, { method: "POST" });
      router.refresh();
    } finally {
      setRetrying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain, vertical }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEditMode(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
    router.push("/brands");
  };

  const handleRunAudit = async () => {
    setRunningAudit(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id }),
      });
      if (!res.ok) return;
      const { auditId } = await res.json();
      router.push(`/audits/${auditId}`);
    } finally {
      setRunningAudit(false);
    }
  };

  // Task #46 Phase 2: a zero-mention audit's scoreComposite is a real,
  // non-fabricated "0.00" (the frequency_only composite basis, lib/scoring/
  // dimension-result.ts) -- plotted here as its own marked point (dashed
  // outline, no fill) rather than collapsing into an indistinguishable
  // filled 0-height bar next to a genuinely low-but-measured score.
  const sparkPoints = recentAudits
    .filter((a): a is typeof a & { scoreComposite: string } => a.scoreComposite != null)
    .map((a) => ({
      value: Number.parseFloat(a.scoreComposite),
      insufficientData: a.insufficientData ?? false,
      promptPackVersion: a.promptPackVersion ?? null,
      methodologyVersion: a.methodologyVersion ?? null,
    }));
  const sparkMax = Math.max(...sparkPoints.map((p) => p.value), 80);

  const inputStyle = (enabled: boolean): React.CSSProperties => ({
    width: "100%",
    height: 36,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 13,
    background: enabled ? "var(--bg-base)" : "transparent",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    cursor: enabled ? "text" : "default",
    outline: "none",
  });

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              padding: 24,
              maxWidth: 420,
              width: "100%",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              Delete {brand.name}?
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>
              This will remove the brand from your workspace. Audit history is preserved but the
              brand will no longer appear in your list. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  background: "var(--danger)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Delete brand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classification failed banner (Part C.5) */}
      {classificationFailed && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 8,
            background: "var(--danger-soft)",
            border: "1px solid var(--danger)",
            marginBottom: 24,
          }}
        >
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)", margin: 0 }}>
              Classification failed
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>
              {brand.classificationError ?? "We couldn't automatically classify this business."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetryClassification}
            disabled={retrying}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              cursor: retrying ? "not-allowed" : "pointer",
              opacity: retrying ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            {retrying ? "Retrying..." : "Retry classification"}
          </button>
        </div>
      )}

      {justConfirmedSuccess && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "var(--success-soft)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            fontSize: 13,
            fontWeight: 500,
            marginBottom: 16,
          }}
        >
          Thanks — your questions are ready. You can run an audit now.
        </div>
      )}

      {/* Build 1 addendum, item 9: anchor target for the blocked-audit
          CTA above, so it actually lands on these cards. */}
      <div id="confirm-business-details">
        {/* Confirm-classification card (Part C.4) */}
        {needsConfirmation && brand.classification && (
          <ClassificationConfirmCard
            brandId={brand.id}
            suggestedCategory={brand.classification.category}
            // Vunnara hotfix (18 Oct, post-df27ef8): the OWNER'S OWN
            // confirmed audience, never a classifier guess derived from
            // buyerType -- null (no selection) until they actually
            // confirm one, so they have to actively choose rather than
            // silently accept a pre-ticked guess. If this brand was
            // confirmed before and is back here for some other reason,
            // its real confirmed value is what shows, not a re-derived
            // guess.
            suggestedAudience={brand.audience}
            suggestedCompetitors={brand.classification.competitors}
            confidence={brand.classification.confidence}
          />
        )}

        {/* Confirm-location card (Part D.4) */}
        {locationNeedsConfirmation && (
          <LocationConfirmCard
            brandId={brand.id}
            currentPrimaryRegion={brand.primaryRegions[0]}
            isLegacyDefaultRegion={isLegacyDefaultRegion}
          />
        )}
      </div>

      {/* Actions bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => setEditMode(!editMode)}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {editMode ? (
            <X style={{ width: 14, height: 14 }} />
          ) : (
            <Edit3 style={{ width: 14, height: 14 }} />
          )}
          {editMode ? "Cancel" : "Edit"}
        </button>
        {editMode && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--bg-elevated)",
            color: "var(--danger)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Trash2 style={{ width: 14, height: 14 }} />
          Delete
        </button>
        <span
          style={{ position: "relative", display: "inline-flex" }}
          title={
            blockedFromAudit
              ? "Confirm your business type and location first — see below."
              : classificationFailed || classificationInProgress
                ? "Questions may not match your business yet — confirm your business details for better results."
                : undefined
          }
        >
          <button
            type="button"
            data-tour="run-audit"
            onClick={handleRunAudit}
            disabled={runningAudit || blockedFromAudit}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
              border: "none",
              cursor: runningAudit || blockedFromAudit ? "not-allowed" : "pointer",
              opacity: runningAudit || blockedFromAudit ? 0.5 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Sparkles style={{ width: 14, height: 14 }} />
            {runningAudit ? "Starting..." : "Run audit"}
          </button>
        </span>
      </div>
      {/* Build 1 addendum, item 9: a real block, with a call to action
          into the confirm card(s) below -- never a silent fallback to
          generic or stale-classification questions. */}
      {blockedFromAudit && (
        <p
          style={{
            fontSize: 12,
            color: "var(--warning)",
            textAlign: "right",
            marginTop: -16,
            marginBottom: 24,
          }}
        >
          <a href="#confirm-business-details" style={{ color: "var(--warning)" }}>
            Confirm your business type and location first (takes 30 seconds)
          </a>
        </p>
      )}
      {!blockedFromAudit && classificationInProgress && (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            textAlign: "right",
            marginTop: -16,
            marginBottom: 24,
          }}
        >
          Classification is still running — questions may use a generic fallback for now.
        </p>
      )}

      {/* Section 1: Brand header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 40 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            fontWeight: 700,
            color: "#fff",
            background: "linear-gradient(135deg, #f97316, #ea580c)",
          }}
        >
          {brand.name[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {brand.name}
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 500,
                background: "var(--success-soft)",
                color: "var(--success)",
              }}
            >
              <span
                style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }}
              />
              Active
            </span>
            {classificationStatus !== "complete" && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 500,
                  background: classificationFailed
                    ? "var(--danger-soft)"
                    : needsConfirmation
                      ? "var(--warning-soft)"
                      : "var(--accent-muted)",
                  color: classificationFailed
                    ? "var(--danger)"
                    : needsConfirmation
                      ? "var(--warning)"
                      : "var(--text-secondary)",
                }}
              >
                {classificationFailed
                  ? "Classification failed"
                  : needsConfirmation
                    ? "Needs your confirmation"
                    : "Classification pending"}
              </span>
            )}
          </div>
          <a
            href={`https://${brand.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
            }}
          >
            {brand.domain}
            <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
              fontSize: 12,
              color: "var(--text-tertiary)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Tag style={{ width: 12, height: 12 }} />
              {brand.vertical}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin style={{ width: 12, height: 12 }} />
              {brand.primaryRegions.length > 0
                ? `${brand.primaryRegions.length} suburb(s)`
                : "No regions set"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Hash style={{ width: 12, height: 12 }} />
              {auditCount} audit{auditCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Section: Audit tools nav */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {[
          {
            href: `/brands/${brand.id}/health-check`,
            label: "Health Check",
            icon: Activity,
            desc: !isTierAtLeast(tier ?? "free", "growth")
              ? "Growth plan required"
              : "Cross-layer traffic-light + #1 action",
            locked: !isTierAtLeast(tier ?? "free", "growth"),
            color: "var(--layer-workflow, #6366f1)",
          },
          {
            href: `/brands/${brand.id}/autopilot`,
            label: "Autopilot",
            icon: Target,
            desc: !isTierAtLeast(tier ?? "free", "growth")
              ? "Growth plan required"
              : "The visible loop: gap → draft → measure",
            locked: !isTierAtLeast(tier ?? "free", "growth"),
            color: "var(--layer-workflow, #6366f1)",
          },
          {
            href: `/brands/${brand.id}/workflow`,
            label: "Workflow",
            icon: GitBranch,
            desc: isFree ? "Starter plan required" : "Tasks & remediation",
            locked: !!isFree,
          },
          {
            href: `/brands/${brand.id}/visibility`,
            label: "Visibility",
            icon: Eye,
            desc: isFree ? "Growth plan required" : "Share of voice & trends",
            locked: !!isFree,
          },
          {
            href: `/brands/${brand.id}/technical-audit`,
            label: "Technical Audit",
            icon: Activity,
            desc: "8-dimension score",
          },
          {
            href: `/brands/${brand.id}/robots-txt-config`,
            label: "Robots.txt",
            icon: Bot,
            desc: "27 AI bot matrix",
          },
          {
            href: `/brands/${brand.id}/llms-txt-generator`,
            label: "llms.txt",
            icon: FileText,
            desc: "Depth scoring",
          },
          {
            href: `/brands/${brand.id}/schema-audit`,
            label: "Schema",
            icon: Code,
            desc: "JSON-LD coverage",
          },
          {
            href: `/brands/${brand.id}/ssr-check`,
            label: "SSR Check",
            icon: MonitorDot,
            desc: "Server-side rendering",
          },
          {
            href: `/brands/${brand.id}/answer-capsules`,
            label: "Answer Capsules",
            icon: MessageCircle,
            desc: "Direct answers",
          },
          {
            href: `/brands/${brand.id}/brand-entity-audit`,
            label: "Brand Entity",
            icon: Shield,
            desc: "AU presence",
          },
          {
            href: `/brands/${brand.id}/trust`,
            label: "Trust",
            icon: ShieldCheck,
            desc: !isTierAtLeast(tier ?? "free", "growth")
              ? "Growth plan required"
              : "Hallucination risk & authority",
            locked: !isTierAtLeast(tier ?? "free", "growth"),
          },
          {
            href: `/brands/${brand.id}/signals`,
            label: "Signals",
            icon: Activity,
            desc: "Negative signals & injection",
          },
          {
            href: `/brands/${brand.id}/schedule`,
            label: "Audit Schedule",
            icon: Calendar,
            desc: "Recurring cadence",
          },
          {
            href: `/brands/${brand.id}/reports`,
            label: "Reports",
            icon: FileText,
            desc: !isTierAtLeast(tier ?? "free", "growth")
              ? "Growth plan required"
              : "AI visibility reports",
            locked: !isTierAtLeast(tier ?? "free", "growth"),
            color: "var(--layer-comm)",
          },
          {
            href: `/brands/${brand.id}/retrieval`,
            label: "Retrieval",
            icon: Search,
            desc: !isTierAtLeast(tier ?? "free", "growth")
              ? "Growth plan required"
              : "Agent readiness & crawlers",
            locked: !isTierAtLeast(tier ?? "free", "growth"),
            color: "var(--layer-retrieval)",
          },
          {
            href: `/brands/${brand.id}/discovery`,
            label: "Discovery",
            icon: Compass,
            desc: !isTierAtLeast(tier ?? "free", "agency")
              ? "Agency plan required"
              : "Conversational journeys & comparisons",
            locked: !isTierAtLeast(tier ?? "free", "agency"),
            color: "var(--layer-discovery)",
          },
        ].map((item) => {
          const locked = "locked" in item && item.locked;
          const iconColor = "color" in item && item.color ? item.color : "var(--accent-primary)";
          return (
            <Link
              key={item.href}
              href={locked ? "#" : item.href}
              onClick={locked ? (e: React.MouseEvent) => e.preventDefault() : undefined}
              aria-disabled={locked || undefined}
              style={{
                padding: "16px 16px",
                borderRadius: 8,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 12,
                transition: "border-color 0.15s",
                opacity: locked ? 0.5 : 1,
                cursor: locked ? "not-allowed" : "pointer",
              }}
            >
              <item.icon style={{ width: 18, height: 18, color: iconColor, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                  {item.desc}
                </div>
              </div>
              {locked && (
                <Lock
                  style={{ width: 14, height: 14, color: "var(--text-tertiary)", flexShrink: 0 }}
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Section 2: KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {(auditCount === 0
          ? [0, 1, 2, 3].map((i) => ({ label: "", value: "", skeleton: true, key: i }))
          : [
              {
                // Task #46 Phase 2: the old `latestAudit?.scoreComposite ? ... : "—"`
                // truthy check never actually caught a zero-mention audit --
                // "0.00" is a non-empty, truthy string -- so it rendered the
                // real-but-unqualified "0.0" as if it were a measured low
                // score. insufficientData is the honest, explicit gate.
                label: "Visibility score",
                value: !latestAudit
                  ? "—"
                  : latestAudit.insufficientData
                    ? "Not mentioned"
                    : latestAudit.scoreComposite != null
                      ? Number.parseFloat(latestAudit.scoreComposite).toFixed(1)
                      : "—",
                key: 0,
              },
              {
                label: "Avg position",
                value: avgPosition != null ? Number(avgPosition).toFixed(1) : "—",
                key: 1,
              },
              {
                label: `Total mentions (${auditCount} audit${auditCount !== 1 ? "s" : ""})`,
                value: totalMentions != null ? totalMentions.toLocaleString() : "—",
                key: 2,
              },
              {
                // Task #46 Phase 3, Part C: Sentiment has no real
                // classifier behind its stored value at all (mention.found
                // ? "positive" : "neutral" -- lib/scoring/dimension-result.ts)
                // -- unconditionally "Not yet measured", every audit, never
                // gated on mention count the way the Visibility score tile's
                // insufficientData is.
                label: "Sentiment",
                value: "Not yet measured",
                key: 3,
              },
            ].map((m) => ({ ...m, skeleton: false }))
        ).map((m) => (
          <div
            key={m.key}
            style={{
              padding: 20,
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
            }}
          >
            {m.skeleton ? (
              <>
                <div
                  style={{
                    height: 12,
                    width: 96,
                    borderRadius: 4,
                    marginBottom: 16,
                    background: "var(--bg-hover)",
                  }}
                />
                <div
                  style={{ height: 28, width: 64, borderRadius: 4, background: "var(--bg-hover)" }}
                />
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                  {m.label}
                </div>
                <div
                  style={{
                    // "Not mentioned" (insufficient-data wording) is a full
                    // word, not a short numeric/dash value -- a smaller size
                    // keeps it from overflowing the tile the way "0.0"/"—"
                    // never would at 24px.
                    fontSize: /[a-zA-Z]/.test(m.value) ? 15 : 24,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {m.value}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Section 3: Sparkline + Per-engine */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 40 }}>
        <div
          style={{
            padding: 24,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Audit history
            </h3>
            <Link
              href="/audits"
              style={{ fontSize: 12, color: "var(--text-tertiary)", textDecoration: "none" }}
            >
              View all
            </Link>
          </div>
          {sparkPoints.length === 0 ? (
            <div
              style={{
                height: 128,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "var(--text-tertiary)",
              }}
            >
              No completed audits yet
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 128 }}>
                {sparkPoints.map((p, i) => {
                  // Vunnara Build 1, Part E.2/G.7: a dashed left edge
                  // marks "something about how this audit was generated
                  // changed here" between two consecutive audits with a
                  // different promptPackVersion (the question set) or
                  // methodologyVersion (memory-only vs web-grounded) --
                  // null on either side (legacy audits predating these
                  // columns) never triggers it, since "unknown" isn't
                  // the same claim as "confirmed different".
                  const prev = i > 0 ? sparkPoints[i - 1] : null;
                  const questionsChanged =
                    prev !== null &&
                    p.promptPackVersion != null &&
                    prev.promptPackVersion != null &&
                    p.promptPackVersion !== prev.promptPackVersion;
                  const methodologyChanged =
                    prev !== null &&
                    p.methodologyVersion != null &&
                    prev.methodologyVersion != null &&
                    p.methodologyVersion !== prev.methodologyVersion;
                  const versionChanged = questionsChanged || methodologyChanged;
                  const title = [
                    questionsChanged ? "Questions changed since the previous audit" : null,
                    methodologyChanged ? "Search methodology changed since the previous audit" : null,
                    p.insufficientData ? "Not mentioned — insufficient data" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      key={`spark-${i}`}
                      title={title || undefined}
                      style={{
                        flex: 1,
                        borderRadius: 2,
                        // Task #46 Phase 2: a zero-mention point gets a fixed,
                        // small, dashed-outline marker instead of being scaled
                        // like a real measured value -- at value 0 it would
                        // otherwise render as an invisible 0-height bar,
                        // indistinguishable from "no audit here at all".
                        height: p.insufficientData ? 10 : `${(p.value / sparkMax) * 100}%`,
                        background: p.insufficientData
                          ? "transparent"
                          : "linear-gradient(180deg, var(--accent-blue), var(--accent-blue-soft))",
                        border: p.insufficientData ? "1px dashed var(--text-tertiary)" : undefined,
                        // Vunnara Build 1, Part E.2: boxShadow (not
                        // borderLeft) for the version-changed marker --
                        // it doesn't share a CSS shorthand with `border`
                        // above, so the two can never fight over which
                        // one wins in a given render.
                        ...(versionChanged ? { boxShadow: "-3px 0 0 0 var(--warning)" } : {}),
                      }}
                    />
                  );
                })}
              </div>
              {sparkPoints.some(
                (p, i) =>
                  i > 0 &&
                  ((p.promptPackVersion != null &&
                    sparkPoints[i - 1].promptPackVersion != null &&
                    p.promptPackVersion !== sparkPoints[i - 1].promptPackVersion) ||
                    (p.methodologyVersion != null &&
                      sparkPoints[i - 1].methodologyVersion != null &&
                      p.methodologyVersion !== sparkPoints[i - 1].methodologyVersion)),
              ) && (
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                    margin: "4px 0 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 0,
                      borderTop: "2px dashed var(--warning)",
                    }}
                  />
                  Questions or search methodology changed between some of these audits — scores
                  before and after aren&apos;t directly comparable.
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                }}
              >
                <span>
                  {sparkPoints.length} week{sparkPoints.length === 1 ? "" : "s"} ago
                </span>
                <span>Now</span>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            padding: 24,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 16px",
            }}
          >
            Per-engine breakdown
          </h3>
          {auditCount === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Run your first audit to see engine scores.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {["chatgpt", "claude", "gemini", "perplexity"].map((engine) => {
                const stat = engineStats.find((e) => e.engine === engine);
                const pct = stat && stat.total > 0 ? (stat.mentions / stat.total) * 100 : 0;
                return (
                  <div key={engine}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)" }}
                      >
                        {ENGINE_DISPLAY[engine]}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {stat ? `${pct.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 9999,
                        overflow: "hidden",
                        background: "var(--accent-muted)",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 9999,
                          background: "var(--success)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {/* TikTok placeholder — Coming v1.1 */}
              <div style={{ opacity: 0.45 }} title="Coming v1.1">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)" }}>
                    TikTok
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "1px 6px",
                      borderRadius: 9999,
                      background: "var(--accent-muted)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    Coming v1.1
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 9999,
                    background: "var(--accent-muted)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Brand settings form */}
      <div
        style={{
          padding: 24,
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 24px",
          }}
        >
          Brand settings
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Brand name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editMode}
              style={inputStyle(editMode)}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Domain
            </label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={!editMode}
              style={inputStyle(editMode)}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Vertical
            </label>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              disabled={!editMode}
              style={inputStyle(editMode)}
            >
              <option value="tradies">Tradies</option>
              <option value="allied_health">Allied Health</option>
              <option value="saas">SaaS</option>
            </select>
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Primary regions
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {brand.primaryRegions.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No regions set</span>
              ) : (
                brand.primaryRegions.map((r) => (
                  <span
                    key={r}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontWeight: 500,
                      // Vunnara hotfix (18 Oct, post-df27ef8): this
                      // pill was styled identically whether the brand
                      // actually confirmed this location or it's still
                      // the pre-Part-D legacy "Sydney CBD" default --
                      // presenting an unconfirmed guess as settled
                      // fact. isLegacyDefaultRegion (already computed
                      // above for LocationConfirmCard) flags that case.
                      background: isLegacyDefaultRegion ? "var(--warning-soft)" : "var(--accent-muted)",
                      color: isLegacyDefaultRegion ? "var(--warning)" : "var(--text-secondary)",
                    }}
                  >
                    {formatLocation(r)}
                    {isLegacyDefaultRegion ? " — default, not confirmed" : ""}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Competitors
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {brand.competitors.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  No competitors set
                </span>
              ) : (
                brand.competitors.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontWeight: 500,
                      background: "var(--accent-muted)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {c}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
