import Link from "next/link";
import type { EngineCost, OperatorCosts, OperatorWorkspaceCost } from "@/lib/admin/costs";
import { formatAudCents, formatAudFromUsd, formatUsd } from "@/lib/constants/currency";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";

/**
 * Part 14 (Sri, 13 Nov): the operator's view of what the providers cost us (lib/admin/costs.ts), on
 * /admin/costs only. A$ first (what the business reads), the provider's US$ beside it (what it bills).
 */
const muted = { color: "var(--text-secondary)" } as const;
const strong = { color: "var(--text-primary)" } as const;
const card = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: 16,
} as const;

function money(usd: number): string {
  return `${formatAudFromUsd(usd)} · ${formatUsd(usd)}`;
}

const STATUS_WORDS: Record<string, string> = {
  pending: "Queued",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};

function Totals({
  byEngine,
  googleUsd,
  totalUsd,
  followUpAudCents,
  incomplete,
}: {
  byEngine: EngineCost[];
  googleUsd: number;
  totalUsd: number;
  followUpAudCents: number;
  incomplete: boolean;
}) {
  return (
    <dl className="grid gap-2 text-[13px]" style={{ gridTemplateColumns: "max-content 1fr" }}>
      <dt style={muted}>Total</dt>
      <dd style={strong} className="font-semibold tabular-nums" data-admin-cost-total="">
        {money(totalUsd)}
        {incomplete ? " (part of it had no price: at least this)" : ""}
      </dd>
      {byEngine.map((e) => (
        <div key={e.engine} className="contents">
          <dt style={muted}>{e.name}</dt>
          <dd className="tabular-nums" style={strong}>
            {money(e.usd)}
          </dd>
        </div>
      ))}
      <dt style={muted}>Google (DataForSEO)</dt>
      <dd className="tabular-nums" style={strong} data-admin-cost-google="">
        {money(googleUsd)}
      </dd>
      {followUpAudCents > 0 && (
        <>
          <dt style={muted}>Follow-up checks</dt>
          <dd className="tabular-nums" style={strong}>
            A${formatAudCents(followUpAudCents)}
          </dd>
        </>
      )}
    </dl>
  );
}

function Workspace({ ws }: { ws: OperatorWorkspaceCost }) {
  const engines = ws.byEngine.map((e) => e.engine);
  const price =
    ws.planPriceAudCents === null
      ? "price agreed per deal"
      : `A$${formatAudCents(ws.planPriceAudCents)} a month incl. GST`;
  return (
    <section style={card} className="space-y-3" data-admin-cost-workspace={ws.organizationId}>
      <div>
        <h2 className="text-[15px] font-semibold" style={strong}>
          {ws.name}
        </h2>
        <p className="text-[12px]" style={muted}>
          {ws.plan} plan · {price}
        </p>
      </div>
      <Totals {...ws} />
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={muted}>
              <th className="text-left py-1 pr-3 font-medium">Audit</th>
              <th className="text-left py-1 pr-3 font-medium">Started (Sydney)</th>
              <th className="text-left py-1 pr-3 font-medium">Status</th>
              {ws.byEngine.map((e) => (
                <th key={e.engine} className="text-right py-1 pr-3 font-medium">
                  {e.name}
                </th>
              ))}
              <th className="text-right py-1 pr-3 font-medium">Google</th>
              <th className="text-right py-1 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {ws.audits.map((a) => (
              <tr
                key={a.auditId}
                style={{ borderTop: "1px solid var(--border-subtle)" }}
                data-admin-cost-audit={a.auditId}
              >
                <td className="py-1 pr-3" style={strong}>
                  #{a.auditNumber} · {a.brandName}
                </td>
                <td className="py-1 pr-3 tabular-nums" style={muted}>
                  {formatInOrgTimezone(new Date(a.createdAt), ws.organizationId, "d MMM HH:mm")}
                </td>
                <td className="py-1 pr-3" style={muted}>
                  {STATUS_WORDS[a.status] ?? a.status}
                </td>
                {engines.map((engine) => {
                  const e = a.engines.find((x) => x.engine === engine);
                  return (
                    <td key={engine} className="py-1 pr-3 text-right tabular-nums" style={strong}>
                      {e ? formatAudFromUsd(e.usd) : "—"}
                    </td>
                  );
                })}
                <td className="py-1 pr-3 text-right tabular-nums" style={strong}>
                  {a.googleUsd > 0 ? formatAudFromUsd(a.googleUsd) : "—"}
                </td>
                <td className="py-1 text-right tabular-nums font-semibold" style={strong}>
                  {money(a.totalUsd)}
                  {a.incomplete ? " +" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function OperatorCostsView({ costs }: { costs: OperatorCosts }) {
  const asOf = new Date(costs.asOf);
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div
        style={{ maxWidth: 960, margin: "0 auto", padding: "32px clamp(16px, 4vw, 32px)" }}
        className="space-y-4"
        data-admin-costs=""
      >
        <div>
          <h1 className="text-xl font-semibold" style={strong}>
            Provider costs
          </h1>
          <p className="text-[13px] mt-1" style={muted}>
            Since 1 {formatInOrgTimezone(asOf, undefined, "MMM")}, Sydney time: what the AI engines
            and DataForSEO (Google) billed for each audit, in A$ with the provider's US$ beside it.
            Operators only; customers never see these figures. A total marked + had a call with no
            price, so it's at least that. <Link href="/admin/settings">Settings →</Link>
          </p>
        </div>
        <section style={card} data-admin-cost-month="">
          <h2 className="text-[15px] font-semibold mb-2" style={strong}>
            All workspaces
          </h2>
          <Totals {...costs} />
        </section>
        {costs.workspaces.length === 0 ? (
          <p className="text-[13px]" style={muted} data-admin-costs-empty="">
            No audits have run this month.
          </p>
        ) : (
          costs.workspaces.map((ws) => <Workspace key={ws.organizationId} ws={ws} />)
        )}
      </div>
    </div>
  );
}
