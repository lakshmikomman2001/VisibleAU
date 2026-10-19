import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withRlsContext } from "@/db/client";
import { audits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  type DimensionResult,
  NOT_MEASURED_DIMENSION,
  resolveComposite,
} from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

function dimValue(d: DimensionResult): number | null {
  return d.status === "scored" ? d.value : null;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const params = await searchParams;
  const ids = (params.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length !== 2) redirect("/audits");

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ids.every((id) => UUID_RE.test(id))) redirect("/audits");

  const { auditA, auditB, dataA, dataB } = await withRlsContext(
    currentUser.organizationId,
    async (tx) => {
      const [auditA] = await tx
        .select({ id: audits.id, auditNumber: audits.auditNumber })
        .from(audits)
        .where(and(eq(audits.id, ids[0]), eq(audits.organizationId, currentUser.organizationId)));
      const [auditB] = await tx
        .select({ id: audits.id, auditNumber: audits.auditNumber })
        .from(audits)
        .where(and(eq(audits.id, ids[1]), eq(audits.organizationId, currentUser.organizationId)));

      if (!auditA || !auditB) redirect("/audits");

      // Task #46 (fix: stored value contradicting its own CI): exactly 2
      // audits, cheap to recompute live from real citations rather than
      // trust the stored score_* columns (see
      // lib/scoring/resolve-audit-dimensions.ts's doc comment for the
      // root cause this replaces).
      const resolvedByAuditId = await resolveOrganicDimensions(tx, [auditA.id, auditB.id]);

      function recompute(auditId: string) {
        const resolved = resolvedByAuditId.get(auditId);
        if (!resolved) return { composite: null, frequency: null, position: null, accuracy: null };
        const composite = resolveComposite({
          frequency: resolved.frequency,
          position: resolved.position,
          sentiment: NOT_MEASURED_DIMENSION,
          context: NOT_MEASURED_DIMENSION,
          accuracy: resolved.accuracy,
        });
        return {
          composite: composite.value,
          frequency: dimValue(resolved.frequency),
          position: dimValue(resolved.position),
          accuracy: dimValue(resolved.accuracy),
        };
      }

      return { auditA, auditB, dataA: recompute(auditA.id), dataB: recompute(auditB.id) };
    },
  );

  // Display-only relabel ("Source citation"): this dimension measures citation rate
  // (accuracyDimensionScore), not factual correctness. DB column (score_accuracy) and internal
  // key (accuracy) are unchanged — see docs/ops for the Phase 1 writeup.
  // Task #46 Phase 3, Part C: Sentiment/Context excluded from this diff
  // table entirely -- their stored columns have no real classifier behind
  // them (lib/scoring/dimension-result.ts), so a side-by-side numeric
  // delta ("+12.0") would read as a real comparison that never happened.
  const dims = ["Frequency", "Position", "Source citation"] as const;
  const dimKeys = ["frequency", "position", "accuracy"] as const;
  const NOT_MEASURED_NOTE =
    "Sentiment and Context aren't scored yet (no real classifier exists) — left out of this comparison.";

  function getDelta(a: number | null, b: number | null): string {
    if (a == null || b == null) return "—";
    const diff = a - b;
    return diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-6">Audit Comparison</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="text-sm text-muted-foreground">Dimension</div>
        <div className="text-sm font-medium">Audit #{auditA.auditNumber}</div>
        <div className="text-sm font-medium">Audit #{auditB.auditNumber}</div>
      </div>

      {/* Task #46 (fix: stored value contradicting its own CI): recomputed
          live from real citations (lib/scoring/resolve-audit-dimensions.ts),
          not the stored score_* columns -- see that file's doc comment
          for the root cause this replaces. */}
      <div className="border rounded-lg p-4 mb-4">
        <div className="grid grid-cols-3 gap-4 items-center">
          <span className="font-medium">Composite</span>
          <span className="text-2xl font-bold">
            {dataA.composite != null ? dataA.composite.toFixed(1) : "—"}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">
              {dataB.composite != null ? dataB.composite.toFixed(1) : "—"}
            </span>
            <span
              className={`text-sm ${getDelta(dataA.composite, dataB.composite).startsWith("+") ? "text-green-600" : getDelta(dataA.composite, dataB.composite).startsWith("-") ? "text-red-600" : "text-muted-foreground"}`}
            >
              {getDelta(dataA.composite, dataB.composite)}
            </span>
          </div>
        </div>
      </div>

      {dims.map((dim, i) => {
        const key = dimKeys[i];
        const a = dataA[key];
        const b = dataB[key];
        return (
          <div key={dim} className="border rounded-lg p-4 mb-2">
            <div className="grid grid-cols-3 gap-4 items-center">
              <span className="text-sm font-medium">{dim}</span>
              <span>{a != null ? a.toFixed(1) : "—"}</span>
              <div className="flex items-center gap-2">
                <span>{b != null ? b.toFixed(1) : "—"}</span>
                <span
                  className={`text-xs ${getDelta(a, b).startsWith("+") ? "text-green-600" : getDelta(a, b).startsWith("-") ? "text-red-600" : ""}`}
                >
                  {getDelta(a, b)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground mt-2">{NOT_MEASURED_NOTE}</p>
    </div>
  );
}
