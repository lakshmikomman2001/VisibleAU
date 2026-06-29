"use client";

interface WorkCompletedCardProps {
  completedThisMonth: number;
  totalTasks: number;
  measuredImpact: number | null;
  gapsClosed: number;
  validationPending: boolean;
}

export function WorkCompletedCard({
  completedThisMonth,
  totalTasks,
  measuredImpact,
  gapsClosed,
  validationPending,
}: WorkCompletedCardProps) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--elevation-rest)",
      }}
    >
      <h3
        className="text-sm font-medium mb-4"
        style={{ color: "var(--text-secondary)" }}
      >
        Work Completed
      </h3>

      {completedThisMonth === 0 ? (
        <p
          className="text-sm"
          style={{ color: "var(--text-tertiary)" }}
        >
          No completed work yet this month
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <span
              className="text-2xl font-semibold"
              style={{
                fontVariantNumeric: "tabular-nums",
                color: "var(--text-primary)",
              }}
            >
              {gapsClosed}
            </span>
            <span
              className="text-sm ml-1"
              style={{ color: "var(--text-secondary)" }}
            >
              of {totalTasks} gaps closed
            </span>
          </div>

          <div
            className="pt-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <h4
              className="text-xs font-medium mb-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              Measured Impact
            </h4>
            {measuredImpact != null ? (
              <span
                className="text-lg font-semibold"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color: measuredImpact > 0 ? "var(--success)" : "var(--text-primary)",
                }}
              >
                {measuredImpact > 0 ? "+" : ""}
                {measuredImpact.toFixed(1)} pts
              </span>
            ) : validationPending ? (
              <p
                className="text-xs"
                style={{ color: "var(--warning)" }}
              >
                Validation audit scheduled — measured impact pending
              </p>
            ) : (
              <span
                className="text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                —
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
