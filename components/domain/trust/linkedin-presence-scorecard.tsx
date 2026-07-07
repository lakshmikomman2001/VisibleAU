"use client";

interface LinkedinData {
  presenceScore: number | null;
  companyPageExists: boolean | null;
  companyPageFollowers: number | null;
  companyPosts30d: number | null;
  founderProfileExists: boolean | null;
  founderFollowers: number | null;
  founderPosts30d: number | null;
  rationale: string;
  confidence_label: string | null;
  scoreLevel: "Low" | "Medium" | "High" | null;
  top_action: string | null;
}

export function LinkedinPresenceScorecard({ data }: { data: LinkedinData }) {
  const score = data.presenceScore ?? 0;

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>LinkedIn Presence Score</p>
        {data.scoreLevel && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: `color-mix(in srgb, var(${data.scoreLevel === "High" ? "--success" : data.scoreLevel === "Medium" ? "--warning" : "--destructive"}) 15%, transparent)`,
              color: `var(${data.scoreLevel === "High" ? "--success" : data.scoreLevel === "Medium" ? "--warning" : "--destructive"})`,
            }}>
            {data.scoreLevel}
          </span>
        )}
      </div>
      <p className="mt-1 text-3xl font-bold" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
        {score}<span className="text-lg font-normal" style={{ color: "var(--muted)" }}>/100</span>
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Company Page</p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            {data.companyPageExists ? `Active — ${data.companyPageFollowers ?? 0} followers, ${data.companyPosts30d ?? 0} posts/30d` : "Not found"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>Founder Profile</p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            {data.founderProfileExists ? `Active — ${data.founderFollowers ?? 0} followers, ${data.founderPosts30d ?? 0} posts/30d` : "Not linked"}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>{data.rationale}</p>
      {data.top_action && (
        <p className="mt-1 text-sm font-medium" style={{ color: "var(--accent-primary)" }}>{data.top_action}</p>
      )}
    </div>
  );
}
