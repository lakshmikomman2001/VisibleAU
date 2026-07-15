"use client";

import type { ReactNode } from "react";

export type StepStatus = "done" | "current" | "pending";

export interface LoopStep {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
  time: string;
  color: string;
  icon: ReactNode;
  detail?: ReactNode;
  scoreAfter?: number | null;
  liftAchieved?: number | null;
}

export function LoopStepCard({
  step,
  isLast,
}: {
  step: LoopStep;
  isLast: boolean;
}) {
  const isDone = step.status === "done";
  const isCurrent = step.status === "current";
  const isPending = step.status === "pending";

  return (
    <div className="relative flex gap-5 mb-6 last:mb-0">
      {!isLast && (
        <div
          className="absolute left-5 top-10 w-0.5 bottom-0"
          style={{
            background: isDone ? step.color : "var(--border-default)",
          }}
        />
      )}

      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCurrent ? "motion-safe:animate-pulse" : ""}`}
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

      <div className="flex-1 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <h3
            className="text-[14px] font-semibold"
            style={{
              color: isPending
                ? "var(--text-tertiary)"
                : "var(--text-primary)",
            }}
          >
            {step.title}
          </h3>
          {isDone && (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--success)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
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
        <p
          className="text-[12px] mb-1"
          style={{
            color: isPending
              ? "var(--text-tertiary)"
              : "var(--text-secondary)",
          }}
        >
          {step.description}
        </p>
        <div
          className="text-[11px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          {step.time}
        </div>

        {step.detail && (
          <div
            className="mt-3 p-3 rounded-lg"
            style={{
              background: `color-mix(in srgb, ${step.color} 7%, transparent)`,
              border: `1px solid color-mix(in srgb, ${step.color} 19%, transparent)`,
            }}
          >
            {step.detail}
          </div>
        )}
      </div>
    </div>
  );
}
