"use client";

import { previewRegion, wizardPreviewQuestions } from "@/lib/prompts/wizard-preview";

interface PromptPreviewProps {
  vertical: string;
  primaryRegion: string;
}

/**
 * The wizard's sample questions for the vertical the owner picked (16 Nov, part 3: lib/prompts/wizard-preview.ts,
 * from the audit's own templates -- never the shared pack's plumber questions), in their suburb once entered.
 */
export function PromptPreview({ vertical, primaryRegion }: PromptPreviewProps) {
  const questions = wizardPreviewQuestions(vertical, primaryRegion);
  if (questions.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }} data-wizard-preview={vertical}>
      <p
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-tertiary)",
          marginBottom: 8,
        }}
      >
        Sample questions
      </p>
      {questions.map((q) => (
        <p
          key={q}
          style={{
            fontSize: 13,
            fontStyle: "italic",
            color: "var(--text-secondary)",
            margin: "4px 0",
          }}
        >
          &ldquo;{q}&rdquo;
        </p>
      ))}
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
        {previewRegion(primaryRegion) === "your suburb"
          ? "Your suburb goes in once you add it. "
          : ""}
        Your own questions are written for your business type once you confirm it.
      </p>
    </div>
  );
}
