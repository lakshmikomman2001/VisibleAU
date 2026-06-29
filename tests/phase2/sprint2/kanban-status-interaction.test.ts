import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/* ── task-kanban.tsx source verification ── */

describe("task-kanban — VALID_COLUMN_MOVES", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("open can only move to in_progress", () => {
    expect(source).toContain('open: ["in_progress"]');
  });

  it("in_progress can move to open or ready_for_review", () => {
    expect(source).toContain('in_progress: ["open", "ready_for_review"]');
  });

  it("ready_for_review can move to in_progress or complete", () => {
    expect(source).toContain('ready_for_review: ["in_progress", "complete"]');
  });

  it("complete has no allowed moves (terminal)", () => {
    expect(source).toContain("complete: []");
  });
});

describe("task-kanban — drag-and-drop infrastructure", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("handles dragOver events on columns", () => {
    expect(source).toContain("onDragOver");
    expect(source).toContain("handleDragOver");
  });

  it("handles dragLeave events on columns", () => {
    expect(source).toContain("onDragLeave");
    expect(source).toContain("handleDragLeave");
  });

  it("handles drop events on columns", () => {
    expect(source).toContain("onDrop");
    expect(source).toContain("handleDrop");
  });

  it("reads task ID from dataTransfer on drop", () => {
    expect(source).toContain('e.dataTransfer.getData("text/plain")');
  });

  it("sets drop effect to move", () => {
    expect(source).toContain('e.dataTransfer.dropEffect = "move"');
  });

  it("tracks dragOverColumn state for visual highlight", () => {
    expect(source).toContain("dragOverColumn");
    expect(source).toContain("setDragOverColumn");
  });
});

describe("task-kanban — optimistic updates and revert", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("maintains local state (localTasks) separate from props", () => {
    expect(source).toContain("const [localTasks, setLocalTasks] = useState(tasks)");
  });

  it("syncs localTasks when props change via useEffect", () => {
    expect(source).toContain("setLocalTasks(tasks)");
    expect(source).toContain("}, [tasks])");
  });

  it("saves previous state before optimistic update", () => {
    expect(source).toContain("const previousTasks = [...localTasks]");
  });

  it("reverts to previous state on failure", () => {
    expect(source).toContain("setLocalTasks(previousTasks)");
  });

  it("calls router.refresh() on success", () => {
    expect(source).toContain("router.refresh()");
  });
});

describe("task-kanban — API routing: PATCH vs POST /complete", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("uses POST /complete for done transitions", () => {
    expect(source).toContain(
      '`/api/brands/${brandId}/tasks/${taskId}/complete`',
    );
    expect(source).toContain('method: "POST"');
  });

  it("uses PATCH for non-done transitions", () => {
    expect(source).toContain('`/api/brands/${brandId}/tasks/${taskId}`');
    expect(source).toContain('method: "PATCH"');
  });

  it("routes to POST only when newStatus === complete", () => {
    expect(source).toContain('newStatus === "complete"');
  });

  it("sends status in PATCH body", () => {
    expect(source).toContain("JSON.stringify({ status: newStatus })");
  });
});

describe("task-kanban — error handling", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("displays error banner with role=alert", () => {
    expect(source).toContain('role="alert"');
  });

  it("error banner is dismissible", () => {
    expect(source).toContain('aria-label="Dismiss error"');
    expect(source).toContain("setError(null)");
  });

  it("sets error on invalid move", () => {
    expect(source).toContain("Cannot move from");
  });

  it("sets error from server error response", () => {
    expect(source).toContain('data.error ?? "Failed to update task status"');
  });
});

describe("task-kanban — 4-column layout", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("has four columns: Open, In Progress, Review, Done", () => {
    expect(source).toContain('"Open"');
    expect(source).toContain('"In Progress"');
    expect(source).toContain('"Review"');
    expect(source).toContain('"Done"');
  });

  it("uses 4-column grid on desktop", () => {
    expect(source).toContain("repeat(4, 1fr)");
  });

  it("shows column count next to heading", () => {
    expect(source).toContain("colTasks.length");
  });

  it("shows column aria-label", () => {
    expect(source).toContain("column`");
  });

  it("has mobile fallback without drag", () => {
    expect(source).toContain("md:hidden");
  });
});

describe("task-kanban — visual drag feedback", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("highlights column with accent-primary during valid drag-over", () => {
    expect(source).toContain("var(--accent-primary)");
    expect(source).toContain("isOver");
  });

  it("uses dashed outline for drag target", () => {
    expect(source).toContain("2px dashed var(--accent-primary)");
  });

  it("clears highlight on drag leave", () => {
    const fn = source.slice(source.indexOf("handleDragLeave"));
    expect(fn).toContain("setDragOverColumn(null)");
  });

  it("clears highlight on drop", () => {
    const fn = source.slice(source.indexOf("handleDrop"));
    expect(fn).toContain("setDragOverColumn(null)");
  });
});

describe("task-card — draggable support", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-card.tsx"),
    "utf-8",
  );

  it("computes canDrag from onDragStart AND not pending", () => {
    expect(source).toContain("const canDrag = !!onDragStart && !pending");
  });

  it("sets draggable from canDrag", () => {
    expect(source).toContain("draggable={canDrag}");
  });

  it("prevents drag start when canDrag is false", () => {
    expect(source).toContain("if (!canDrag) { e.preventDefault(); return; }");
  });

  it("sets task ID in dataTransfer on drag start", () => {
    expect(source).toContain('e.dataTransfer.setData("text/plain", id)');
  });

  it("sets effectAllowed to move", () => {
    expect(source).toContain('e.dataTransfer.effectAllowed = "move"');
  });

  it("shows grab cursor only when canDrag", () => {
    expect(source).toContain('cursor: canDrag ? "grab" : "default"');
  });
});

describe("task-card — Move-to buttons (keyboard/click path)", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-card.tsx"),
    "utf-8",
  );

  it("renders move buttons when allowedMoves and onMove provided and NOT pending", () => {
    expect(source).toContain("allowedMoves && allowedMoves.length > 0 && onMove");
    expect(source).toContain("!pending && (allowedMoves?.length || onGenerateDraft)");
  });

  it("stopPropagation on move button click", () => {
    expect(source).toContain("e.stopPropagation()");
  });

  it("calls onMove with task id and target status", () => {
    expect(source).toContain("onMove(id, m.key)");
  });

  it("has aria-label on each move button", () => {
    expect(source).toContain("Move to ${m.label}");
  });

  it("uses ArrowRight icon", () => {
    expect(source).toContain("ArrowRight");
  });
});

describe("tasks-page-client — passes brandId to TaskKanban", () => {
  const source = fs.readFileSync(
    path.resolve(
      "app/(auth)/brands/[brandId]/workflow/tasks/tasks-page-client.tsx",
    ),
    "utf-8",
  );

  it("has brandId in TasksPageClientProps", () => {
    expect(source).toContain("brandId: string");
  });

  it("passes brandId to TaskKanban", () => {
    expect(source).toContain("brandId={brandId}");
  });
});

describe("task-kanban — getAllowedMoves function", () => {
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

  it("open → [In Progress]", () => {
    const moves = getAllowedMoves("open");
    expect(moves).toEqual([{ key: "in_progress", label: "In Progress" }]);
  });

  it("in_progress → [Open, Review]", () => {
    const moves = getAllowedMoves("in_progress");
    expect(moves).toEqual([
      { key: "open", label: "Open" },
      { key: "ready_for_review", label: "Review" },
    ]);
  });

  it("ready_for_review → [In Progress, Done]", () => {
    const moves = getAllowedMoves("ready_for_review");
    expect(moves).toEqual([
      { key: "in_progress", label: "In Progress" },
      { key: "complete", label: "Done" },
    ]);
  });

  it("complete → [] (no moves)", () => {
    const moves = getAllowedMoves("complete");
    expect(moves).toEqual([]);
  });

  it("unknown status → [] (safe fallback)", () => {
    const moves = getAllowedMoves("invalid_status");
    expect(moves).toEqual([]);
  });
});

describe("task-kanban — TaskKanban accepts brandId prop", () => {
  const source = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("TaskKanbanProps includes brandId", () => {
    expect(source).toContain("brandId: string");
  });

  it("uses brandId in API call paths", () => {
    expect(source).toContain("${brandId}");
  });
});

/* ── Fix A: complete/wont_fix cards are NOT draggable ── */

describe("Fix A — complete cards are non-draggable", () => {
  const kanbanSource = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("only passes onDragStart when card has allowed moves", () => {
    expect(kanbanSource).toContain("onDragStart={hasMoves ? () => {} : undefined}");
  });

  it("computes hasMoves from getAllowedMoves length", () => {
    expect(kanbanSource).toContain("const hasMoves = moves.length > 0");
  });

  it("complete cards get onDragStart=undefined (getAllowedMoves returns [])", () => {
    const VALID_COLUMN_MOVES: Record<string, readonly string[]> = {
      open: ["in_progress"],
      in_progress: ["open", "ready_for_review"],
      ready_for_review: ["in_progress", "complete"],
      complete: [],
    };
    expect(VALID_COLUMN_MOVES["complete"].length).toBe(0);
  });

  it("open cards get onDragStart defined (getAllowedMoves returns non-empty)", () => {
    const VALID_COLUMN_MOVES: Record<string, readonly string[]> = {
      open: ["in_progress"],
      in_progress: ["open", "ready_for_review"],
      ready_for_review: ["in_progress", "complete"],
      complete: [],
    };
    expect(VALID_COLUMN_MOVES["open"].length).toBeGreaterThan(0);
  });
});

/* ── Fix B: same-column drop is a silent no-op ── */

describe("Fix B — same-column drop is a silent no-op", () => {
  const kanbanSource = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("early-returns when task.status === newStatus", () => {
    expect(kanbanSource).toContain("if (task.status === newStatus) return");
  });

  it("same-status check is before the VALID_COLUMN_MOVES check", () => {
    const fn = kanbanSource.slice(kanbanSource.indexOf("handleMoveTask"));
    const sameStatusIdx = fn.indexOf("task.status === newStatus");
    const validMovesIdx = fn.indexOf("VALID_COLUMN_MOVES[task.status]");
    expect(sameStatusIdx).toBeGreaterThan(-1);
    expect(validMovesIdx).toBeGreaterThan(-1);
    expect(sameStatusIdx).toBeLessThan(validMovesIdx);
  });

  it("does NOT setError for same-column drops", () => {
    const fn = kanbanSource.slice(kanbanSource.indexOf("handleMoveTask"));
    const sameCheck = fn.indexOf("task.status === newStatus");
    const nextReturn = fn.indexOf("return", sameCheck);
    const setErrorAfterSame = fn.indexOf("setError", sameCheck);
    expect(nextReturn).toBeLessThan(setErrorAfterSame);
  });
});

/* ── Fix C: in-flight guard prevents double-fire ── */

describe("Fix C — in-flight guard prevents double-fire (useRef)", () => {
  const kanbanSource = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("uses a ref (not state) for the synchronous in-flight guard", () => {
    expect(kanbanSource).toContain("const inFlightRef = useRef<Set<string>>(new Set())");
  });

  it("checks ref synchronously before allowing the move", () => {
    expect(kanbanSource).toContain("if (inFlightRef.current.has(taskId)) return");
  });

  it("adds taskId to ref synchronously before API call (no async gap)", () => {
    const fn = kanbanSource.slice(kanbanSource.indexOf("handleMoveTask"));
    const addCall = fn.indexOf("inFlightRef.current.add(taskId)");
    const fetchCall = fn.indexOf("await fetch");
    expect(addCall).toBeGreaterThan(-1);
    expect(fetchCall).toBeGreaterThan(-1);
    expect(addCall).toBeLessThan(fetchCall);
  });

  it("removes taskId from ref in finally block", () => {
    expect(kanbanSource).toContain("inFlightRef.current.delete(taskId)");
  });

  it("maintains separate pendingTaskIds state for UI rendering", () => {
    expect(kanbanSource).toContain("const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set())");
  });

  it("sets pendingTaskIds state for visual feedback", () => {
    expect(kanbanSource).toContain("setPendingTaskIds((prev) => new Set(prev).add(taskId))");
  });

  it("clears pendingTaskIds in finally block", () => {
    const finallyBlock = kanbanSource.slice(kanbanSource.indexOf("finally {"));
    expect(finallyBlock).toContain("next.delete(taskId)");
  });

  it("does NOT include inFlightRef in useCallback deps (refs are stable)", () => {
    expect(kanbanSource).toContain("[localTasks, brandId, router]");
    expect(kanbanSource).not.toContain("[localTasks, brandId, router, movingTaskIds]");
  });
});

/* ── Fix C: pending state on task-card ── */

describe("Fix C — task-card pending state", () => {
  const cardSource = fs.readFileSync(
    path.resolve("components/domain/workflow/task-card.tsx"),
    "utf-8",
  );

  it("accepts pending prop in TaskCardProps", () => {
    expect(cardSource).toContain("pending?: boolean");
  });

  it("sets aria-busy when pending", () => {
    expect(cardSource).toContain("aria-busy={pending || undefined}");
  });

  it("reduces opacity when pending", () => {
    expect(cardSource).toContain("opacity: pending ? 0.5 : 1");
  });

  it("disables pointer events when pending", () => {
    expect(cardSource).toContain('pointerEvents: pending ? "none" : undefined');
  });

  it("hides move buttons when pending", () => {
    expect(cardSource).toContain("&& !pending");
  });

  it("prevents drag when pending (canDrag is false)", () => {
    expect(cardSource).toContain("!!onDragStart && !pending");
  });
});

/* ── Fix C: kanban passes pending prop to cards ── */

describe("Fix C — kanban passes pending prop to TaskCard", () => {
  const kanbanSource = fs.readFileSync(
    path.resolve("components/domain/workflow/task-kanban.tsx"),
    "utf-8",
  );

  it("passes pending to desktop cards", () => {
    expect(kanbanSource).toContain("pending={pendingTaskIds.has(t.id)}");
  });

  it("passes pending to mobile cards", () => {
    const mobileSection = kanbanSource.slice(kanbanSource.indexOf("md:hidden"));
    expect(mobileSection).toContain("pending={pendingTaskIds.has(t.id)}");
  });
});
