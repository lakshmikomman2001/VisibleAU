"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { TaskCard } from "./task-card";
import { EmptyState } from "@/components/phase2/empty-state";
import { GenerateDraftModal } from "./generate-draft-modal";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: number;
  effort: string | null;
  confidenceLabel: string | null;
  dimension: string | null;
  scoreBefore: string | null;
  scoreAfter: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  reauditDeferredReason: string | null;
}

interface TaskKanbanProps {
  tasks: Task[];
  brandId: string;
}

const COLUMNS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "ready_for_review", label: "Review" },
  { key: "complete", label: "Done" },
] as const;

const VALID_COLUMN_MOVES: Record<string, readonly string[]> = {
  open: ["in_progress"],
  in_progress: ["open", "ready_for_review"],
  ready_for_review: ["in_progress", "complete"],
  complete: [],
};

function getAllowedMoves(status: string) {
  const keys = VALID_COLUMN_MOVES[status] ?? [];
  return keys.map((key) => ({
    key,
    label: COLUMNS.find((c) => c.key === key)?.label ?? key,
  }));
}

export function TaskKanban({ tasks, brandId }: TaskKanbanProps) {
  const router = useRouter();
  const [localTasks, setLocalTasks] = useState(tasks);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());
  const [draftTarget, setDraftTarget] = useState<{ taskId: string; title: string } | null>(null);

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const handleMoveTask = useCallback(
    async (taskId: string, newStatus: string) => {
      const task = localTasks.find((t) => t.id === taskId);
      if (!task) return;

      if (task.status === newStatus) return;

      if (inFlightRef.current.has(taskId)) return;

      const allowed = VALID_COLUMN_MOVES[task.status] ?? [];
      if (!allowed.includes(newStatus)) {
        setError(
          `Cannot move from "${COLUMNS.find((c) => c.key === task.status)?.label}" to "${COLUMNS.find((c) => c.key === newStatus)?.label}"`,
        );
        return;
      }

      inFlightRef.current.add(taskId);
      const previousTasks = [...localTasks];
      setLocalTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)),
      );
      setPendingTaskIds((prev) => new Set(prev).add(taskId));
      setError(null);

      try {
        let res: Response;
        if (newStatus === "complete") {
          res = await fetch(
            `/api/brands/${brandId}/tasks/${taskId}/complete`,
            { method: "POST" },
          );
        } else {
          res = await fetch(`/api/brands/${brandId}/tasks/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update task status");
        }

        router.refresh();
      } catch (err) {
        setLocalTasks(previousTasks);
        setError(err instanceof Error ? err.message : "Failed to update task");
      } finally {
        inFlightRef.current.delete(taskId);
        setPendingTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [localTasks, brandId, router],
  );

  function handleDragOver(e: React.DragEvent, columnKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnKey);
  }

  function handleDragLeave(e: React.DragEvent, columnKey: string) {
    if (
      e.relatedTarget &&
      (e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)
    ) {
      return;
    }
    if (dragOverColumn === columnKey) {
      setDragOverColumn(null);
    }
  }

  function handleDrop(e: React.DragEvent, targetStatus: string) {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      handleMoveTask(taskId, targetStatus);
    }
  }

  if (localTasks.length === 0) {
    return (
      <EmptyState message="No tasks yet — create one from a recommendation" />
    );
  }

  return (
    <>
      {error && (
        <div
          className="flex items-center justify-between rounded-md px-3 py-2 mb-4 text-sm"
          style={{
            backgroundColor: "var(--danger-soft)",
            color: "var(--danger)",
          }}
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--danger)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "0 4px",
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Desktop: 4-column kanban with drag-and-drop */}
      <div
        className="hidden md:grid gap-4"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        aria-label="Task board"
      >
        {COLUMNS.map((col) => {
          const colTasks = localTasks.filter((t) => t.status === col.key);
          const isOver = dragOverColumn === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={(e) => handleDragLeave(e, col.key)}
              onDrop={(e) => handleDrop(e, col.key)}
              style={{
                borderRadius: 8,
                padding: 4,
                transition: "background-color 150ms ease",
                backgroundColor: isOver
                  ? "color-mix(in srgb, var(--accent-primary) 10%, transparent)"
                  : "transparent",
                outline: isOver
                  ? "2px dashed var(--accent-primary)"
                  : "2px dashed transparent",
              }}
              aria-label={`${col.label} column`}
            >
              <h3
                className="text-sm font-medium mb-3 pb-2"
                style={{
                  color: "var(--text-secondary)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                {col.label}{" "}
                <span
                  className="ml-1"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {colTasks.length}
                </span>
              </h3>
              {colTasks.length === 0 ? (
                <p
                  className="text-xs py-4 text-center"
                  style={{ color: "var(--text-disabled)" }}
                >
                  Nothing here
                </p>
              ) : (
                colTasks.map((t) => {
                  const moves = getAllowedMoves(t.status);
                  const hasMoves = moves.length > 0;
                  return (
                    <TaskCard
                      key={t.id}
                      {...t}
                      allowedMoves={moves}
                      onMove={handleMoveTask}
                      onDragStart={hasMoves ? () => {} : undefined}
                      pending={pendingTaskIds.has(t.id)}
                      onGenerateDraft={(taskId, title) => setDraftTarget({ taskId, title })}
                    />
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: single-column grouped list (no drag — use Move-to buttons) */}
      <div className="md:hidden space-y-4">
        {COLUMNS.map((col) => {
          const colTasks = localTasks.filter((t) => t.status === col.key);
          if (colTasks.length === 0) return null;
          return (
            <div key={col.key}>
              <h3
                className="text-sm font-medium mb-2 sticky top-0 py-1"
                style={{
                  color: "var(--text-secondary)",
                  backgroundColor: "var(--bg-base)",
                }}
              >
                {col.label} ({colTasks.length})
              </h3>
              {colTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  {...t}
                  allowedMoves={getAllowedMoves(t.status)}
                  onMove={handleMoveTask}
                  pending={pendingTaskIds.has(t.id)}
                  onGenerateDraft={(taskId, title) => setDraftTarget({ taskId, title })}
                />
              ))}
            </div>
          );
        })}
      </div>

      {draftTarget && (
        <GenerateDraftModal
          brandId={brandId}
          taskId={draftTarget.taskId}
          taskTitle={draftTarget.title}
          onClose={() => setDraftTarget(null)}
        />
      )}
    </>
  );
}
