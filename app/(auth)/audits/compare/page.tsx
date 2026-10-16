import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withRlsContext } from "@/db/client";
import { audits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

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

  const { auditA, auditB } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [auditA] = await tx
      .select()
      .from(audits)
      .where(and(eq(audits.id, ids[0]), eq(audits.organizationId, currentUser.organizationId)));
    const [auditB] = await tx
      .select()
      .from(audits)
      .where(and(eq(audits.id, ids[1]), eq(audits.organizationId, currentUser.organizationId)));

    if (!auditA || !auditB) redirect("/audits");

    return { auditA, auditB };
  });

  // Display-only relabel ("Source citation"): this dimension measures citation rate
  // (accuracyDimensionScore), not factual correctness. DB column (score_accuracy) and internal
  // key (accuracy) are unchanged — see docs/ops for the Phase 1 writeup.
  // Task #46 Phase 3, Part C: Sentiment/Context excluded from this diff
  // table entirely -- their stored columns have no real classifier behind
  // them (lib/scoring/dimension-result.ts), so a side-by-side numeric
  // delta ("+12.0") would read as a real comparison that never happened.
  const dims = ["Frequency", "Position", "Source citation"] as const;
  const dimKeys = ["scoreFrequency", "scorePosition", "scoreAccuracy"] as const;
  const NOT_MEASURED_NOTE =
    "Sentiment and Context aren't scored yet (no real classifier exists) -- left out of this comparison.";

  function getDelta(key: string): string {
    const a = (auditA as Record<string, unknown>)[key];
    const b = (auditB as Record<string, unknown>)[key];
    if (!a || !b) return "—";
    const diff = parseFloat(a as string) - parseFloat(b as string);
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

      {/* Task #46 Phase 3, Part C: these are the STORED score_composite
          columns, not a live resolveComposite recompute -- an audit
          scored before this fix still carries Sentiment/Context fabricated
          into its stored composite at their old 20%/15% weight (see
          app/api/badge/route.ts for the live-recompute version of this
          same fix, applied there because that surface is public). Known
          approximation for this internal diff tool; not fixed here to
          avoid a second per-audit citations query on a low-traffic page. */}
      <div className="border rounded-lg p-4 mb-4">
        <div className="grid grid-cols-3 gap-4 items-center">
          <span className="font-medium">Composite</span>
          <span className="text-2xl font-bold">
            {auditA.scoreComposite ? parseFloat(auditA.scoreComposite).toFixed(1) : "—"}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">
              {auditB.scoreComposite ? parseFloat(auditB.scoreComposite).toFixed(1) : "—"}
            </span>
            <span
              className={`text-sm ${getDelta("scoreComposite").startsWith("+") ? "text-green-600" : getDelta("scoreComposite").startsWith("-") ? "text-red-600" : "text-muted-foreground"}`}
            >
              {getDelta("scoreComposite")}
            </span>
          </div>
        </div>
      </div>

      {dims.map((dim, i) => (
        <div key={dim} className="border rounded-lg p-4 mb-2">
          <div className="grid grid-cols-3 gap-4 items-center">
            <span className="text-sm font-medium">{dim}</span>
            <span>
              {(auditA as Record<string, unknown>)[dimKeys[i]]
                ? parseFloat((auditA as Record<string, unknown>)[dimKeys[i]] as string).toFixed(1)
                : "—"}
            </span>
            <div className="flex items-center gap-2">
              <span>
                {(auditB as Record<string, unknown>)[dimKeys[i]]
                  ? parseFloat((auditB as Record<string, unknown>)[dimKeys[i]] as string).toFixed(1)
                  : "—"}
              </span>
              <span
                className={`text-xs ${getDelta(dimKeys[i]).startsWith("+") ? "text-green-600" : getDelta(dimKeys[i]).startsWith("-") ? "text-red-600" : ""}`}
              >
                {getDelta(dimKeys[i])}
              </span>
            </div>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground mt-2">{NOT_MEASURED_NOTE}</p>
    </div>
  );
}
