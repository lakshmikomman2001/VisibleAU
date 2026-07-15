"use client";

import {
  Activity,
  CheckCircle2,
  Lightbulb,
  Target,
  TrendingUp,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { LoopStepCard, type LoopStep, type StepStatus } from "./loop-step-card";

export interface RemediationTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  scoreBefore: number | null;
  scoreAfter: number | null;
  liftAchieved: number | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface TopicalGap {
  topicCluster: string;
  topicLabel: string;
  estimatedCitationImpact: number | null;
  priorityRank: number;
}

export interface ContentDraft {
  id: string;
  title: string;
  status: string;
  approvedAt: string | null;
}

interface Explainability {
  rationale: string;
  confidenceNote: string;
  topAction: string | null;
}

export interface AuditSummary {
  scoreComposite: number | null;
  engineCount: number;
  promptsCount: number;
  completedAt: string | null;
}

export interface AutopilotLoopData {
  audit: AuditSummary | null;
  topGap: TopicalGap | null;
  topTask: RemediationTask | null;
  explainability: Explainability | null;
  draft: ContentDraft | null;
  brandId: string;
  brandName: string;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function deriveStepStatus(
  audit: AuditSummary | null,
  topGap: TopicalGap | null,
  task: RemediationTask | null,
  draft: ContentDraft | null,
): StepStatus[] {
  if (!audit?.completedAt) return ["current", "pending", "pending", "pending", "pending"];
  if (!topGap && !task) return ["done", "current", "pending", "pending", "pending"];
  if (!task || task.status === "open") return ["done", "done", "current", "pending", "pending"];
  if (!draft || draft.status === "draft") return ["done", "done", "done", "current", "pending"];
  if (draft.status === "approved" || draft.status === "published") {
    if (task.scoreAfter != null) return ["done", "done", "done", "done", "done"];
    return ["done", "done", "done", "done", "current"];
  }
  return ["done", "done", "done", "current", "pending"];
}

export function AutopilotLoop({ data }: { data: AutopilotLoopData }) {
  const { audit, topGap, topTask, explainability, draft, brandId, brandName } = data;

  const statuses = deriveStepStatus(audit, topGap, topTask, draft);

  const steps: LoopStep[] = [
    {
      id: 1,
      color: "var(--step-audit, #6366f1)",
      icon: <Activity size={16} />,
      title: "Audit complete",
      description: audit
        ? `Visibility score: ${Number(audit.scoreComposite ?? 0).toFixed(1)} · ${audit.engineCount} engines · ${audit.promptsCount} prompts`
        : "Waiting for first audit to complete",
      status: statuses[0],
      time: audit?.completedAt ? formatDate(audit.completedAt) : "",
    },
    {
      id: 2,
      color: "var(--step-gap, #f59e0b)",
      icon: <Target size={16} />,
      title: "#1 gap identified",
      description: topGap
        ? `${topGap.topicLabel}: priority #${topGap.priorityRank}`
        : topTask
          ? `${topTask.title}`
          : "No gaps identified yet",
      status: statuses[1],
      time: topGap
        ? `Topic: ${topGap.topicCluster}`
        : topTask
          ? `Priority: ${topTask.priority ?? "—"}`
          : "",
    },
    {
      id: 3,
      color: "var(--step-explain, #8b5cf6)",
      icon: <Lightbulb size={16} />,
      title: "Explanation shown",
      description: explainability?.rationale ?? "Explanation will appear after gap analysis",
      status: statuses[2],
      time: explainability?.confidenceNote ?? "",
    },
    {
      id: 4,
      color: "var(--step-draft, #10b981)",
      icon: <CheckCircle2 size={16} />,
      title: "Draft approved",
      description: draft
        ? `${draft.title} · ${draft.status === "approved" ? "Approved" : draft.status}`
        : "Content draft will be generated for the top gap",
      status: statuses[3],
      time: draft?.approvedAt ? formatDate(draft.approvedAt) : "",
      detail:
        statuses[3] === "current" && draft?.status === "draft" ? (
          <div>
            <div
              className="text-[12px] font-medium mb-1"
              style={{ color: "var(--step-draft, #10b981)" }}
            >
              Ready for review
            </div>
            <div
              className="text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Approve this draft to trigger a validation re-audit.
            </div>
            <Link
              href={`/brands/${brandId}/workflow/drafts`}
              className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium"
              style={{ color: "var(--step-draft, #10b981)" }}
            >
              Review draft <ArrowRight size={12} />
            </Link>
          </div>
        ) : undefined,
    },
    {
      id: 5,
      color: "var(--step-measure, #3b82f6)",
      icon: <TrendingUp size={16} />,
      title: "Re-audit + measurement",
      description: buildMeasureDescription(topTask),
      status: statuses[4],
      time: buildMeasureTime(topTask),
      scoreAfter: topTask?.scoreAfter != null ? Number(topTask.scoreAfter) : null,
      liftAchieved: topTask?.liftAchieved != null ? Number(topTask.liftAchieved) : null,
      detail:
        statuses[4] === "current" && topTask?.scoreAfter == null ? (
          <div className="flex items-start gap-3">
            <Clock
              size={14}
              style={{
                marginTop: 2,
                color: "var(--warning)",
                flexShrink: 0,
              }}
            />
            <div>
              <div
                className="text-[12px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Validation audit scheduled — pending
              </div>
              <div
                className="text-[11px] mt-0.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                Measured impact will appear after the re-audit completes.
              </div>
            </div>
          </div>
        ) : undefined,
    },
  ];

  const currentStepIdx = statuses.findIndex((s) => s === "current");

  return (
    <div>
      <div
        className="px-8 py-8 motion-safe:animate-gradient-shift"
        style={{
          background:
            "var(--autopilot-gradient, linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa))",
          backgroundSize: "200% auto",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Target size={18} style={{ color: "rgba(255,255,255,0.8)" }} />
          <span
            className="text-[13px] font-medium"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            Autopilot Loop
          </span>
        </div>
        <h1 className="text-2xl font-semibold" style={{ color: "#fff" }}>
          {brandName}
          {topGap ? ` — ${topGap.topicLabel} Campaign` : ""}
        </h1>
        <p
          className="text-[13px] mt-1"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          {currentStepIdx >= 0
            ? `Step ${currentStepIdx + 1} of 5 · ${steps[currentStepIdx].title}`
            : "Loop complete"}
        </p>
      </div>

      {/* Vertical timeline — <lg only */}
      <div
        className="lg:hidden max-w-[640px] mx-auto px-8 py-8"
        aria-live="polite"
        aria-busy={false}
      >
        <div className="relative">
          {steps.map((step, i) => (
            <LoopStepCard
              key={step.id}
              step={step}
              isLast={i === steps.length - 1}
            />
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <Link
            href={`/brands/${brandId}`}
            className="flex-1 h-10 text-[13px] font-medium rounded-lg flex items-center justify-center gap-2 motion-safe:animate-gradient-shift"
            style={{
              background:
                "var(--autopilot-gradient, linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa))",
              color: "#fff",
              backgroundSize: "200% auto",
            }}
          >
            <Sparkles size={14} />
            Back to brand
          </Link>
        </div>
      </div>

      {/* Horizontal stepper — ≥lg only */}
      <div
        className="hidden lg:block px-8 py-8"
        aria-live="polite"
        aria-busy={false}
      >
        {/* Rail: circles + connectors */}
        <div className="flex items-center justify-between mb-8">
          {steps.map((step, i) => {
            const isDone = step.status === "done";
            const isCurrent = step.status === "current";
            const isPending = step.status === "pending";
            return (
              <div key={step.id} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${isCurrent ? "motion-safe:animate-pulse" : ""}`}
                    style={{
                      background: isDone || isCurrent ? step.color : "var(--bg-elevated)",
                      border: isPending
                        ? `2px dashed color-mix(in srgb, ${step.color} 38%, transparent)`
                        : `2px solid ${step.color}`,
                      opacity: isPending ? 0.5 : 1,
                    }}
                  >
                    <span
                      style={{
                        color: isDone || isCurrent ? "#fff" : step.color,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {step.icon}
                    </span>
                  </div>
                  <span
                    className="text-[11px] font-medium text-center max-w-[90px]"
                    style={{
                      color: isPending ? "var(--text-tertiary)" : "var(--text-primary)",
                    }}
                  >
                    {step.title}
                  </span>
                  {isDone && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--success)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isCurrent && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: `color-mix(in srgb, ${step.color} 13%, transparent)`,
                        color: step.color,
                      }}
                    >
                      In progress
                    </span>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className="flex-1 h-0.5 mx-3 self-start mt-[22px]"
                    style={{
                      background: isDone
                        ? step.color
                        : "var(--border-default)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Active step detail panel */}
        {currentStepIdx >= 0 && (
          <div
            className="rounded-xl p-5"
            style={{
              background: "var(--bg-elevated)",
              border: `1px solid color-mix(in srgb, ${steps[currentStepIdx].color} 25%, transparent)`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: steps[currentStepIdx].color, display: "flex" }}>
                {steps[currentStepIdx].icon}
              </span>
              <h3
                className="text-[14px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Step {currentStepIdx + 1}: {steps[currentStepIdx].title}
              </h3>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: `color-mix(in srgb, ${steps[currentStepIdx].color} 13%, transparent)`,
                  color: steps[currentStepIdx].color,
                }}
              >
                In progress
              </span>
            </div>
            <p
              className="text-[12px] mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {steps[currentStepIdx].description}
            </p>
            {steps[currentStepIdx].time && (
              <div
                className="text-[11px] mb-2"
                style={{ color: "var(--text-tertiary)" }}
              >
                {steps[currentStepIdx].time}
              </div>
            )}
            {steps[currentStepIdx].detail && (
              <div
                className="mt-3 p-3 rounded-lg"
                style={{
                  background: `color-mix(in srgb, ${steps[currentStepIdx].color} 7%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${steps[currentStepIdx].color} 19%, transparent)`,
                }}
              >
                {steps[currentStepIdx].detail}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <Link
            href={`/brands/${brandId}`}
            className="flex-1 h-10 text-[13px] font-medium rounded-lg flex items-center justify-center gap-2 motion-safe:animate-gradient-shift"
            style={{
              background:
                "var(--autopilot-gradient, linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa))",
              color: "#fff",
              backgroundSize: "200% auto",
            }}
          >
            <Sparkles size={14} />
            Back to brand
          </Link>
        </div>
      </div>
    </div>
  );
}

export function buildMeasureDescription(task: RemediationTask | null): string {
  if (!task) return "Validation re-audit will run after draft approval";
  if (task.scoreAfter == null) return "Validation audit scheduled — pending";
  const lift = Number(task.liftAchieved ?? 0);
  if (lift > 0) return `Citation rate improved +${lift.toFixed(1)}% · verified by re-audit`;
  if (lift < 0) return `Citation rate changed ${lift.toFixed(1)}% · verified by re-audit`;
  return "No measurable change yet · verified by re-audit";
}

function buildMeasureTime(task: RemediationTask | null): string {
  if (!task) return "";
  if (task.scoreAfter == null) return "Pending re-audit";
  return task.completedAt ? formatDate(task.completedAt) : "";
}
