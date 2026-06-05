import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { audits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const params = await searchParams;
  const ids = (params.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length !== 2) redirect("/audits");

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ids.every((id) => UUID_RE.test(id))) redirect("/audits");

  const [auditA] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, ids[0]), eq(audits.organizationId, currentUser.organizationId)));
  const [auditB] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, ids[1]), eq(audits.organizationId, currentUser.organizationId)));

  if (!auditA || !auditB) redirect("/audits");

  const dims = ["Frequency", "Position", "Sentiment", "Context", "Accuracy"] as const;
  const dimKeys = [
    "scoreFrequency",
    "scorePosition",
    "scoreSentimentNumeric",
    "scoreContextNumeric",
    "scoreAccuracy",
  ] as const;

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
    </div>
  );
}
