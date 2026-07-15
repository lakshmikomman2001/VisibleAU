# FIX S8-MED-11 — Build the missing metadata-expand on audit-log-row (F21) + flag the non-canonical residency resource_type (F20)

## Severity: F21 LOW-MEDIUM (spec'd §6U.3 interaction element never built; the privilege-change actions store their substance in metadata, currently unviewable) · F20 LOW (canon note, no code change)

## F21 — the metadata expand was never built (proven)
`components/domain/governance/audit-log-row.tsx` accepts a `metadata` prop (declared in the
`AuditLogEntry` interface, line ~8) but **never references it in the JSX** — no expand control, no
chevron, no collapsed section. §6U.3 requires: `audit-log-row.tsx: action + resource_type + actor +
timestamp + **metadata expand**`. The DB confirms this is a real gap, not hidden-when-empty: two
`hallucination_acknowledged` rows carry `metadata = {"brandId": "418f321f-..."}` and it renders
nowhere. And `member_role_changed` / `member_removed` / `member_invited` write metadata at their
call sites (the substance of a privilege change — e.g. old→new role — lives ONLY in metadata), so
without the expand those security-sensitive entries show no detail at all.

### Task
Add a metadata-expand affordance to `audit-log-row.tsx`:
1. **Only render an expand control when `metadata` is present and non-empty** (null/`{}` → no
   control, row stays compact — so the current residency/benchmark rows correctly show nothing).
2. When present, show an expand affordance (a chevron / "Details" toggle) that reveals the metadata
   inline below the row. §6U.3: "the metadata expands inline."
3. Render the metadata readably — a small key/value list (e.g. `brandId: 418f321f-…`), not raw
   `JSON.stringify` dumped as one line. Truncate long ids the way the existing resource_id is
   truncated (`66c545bf…`); consider making full values available on hover/title.
4. State + a11y: use a local `useState` for open/closed; the toggle is keyboard-operable with
   `aria-expanded` and controls the panel via `aria-controls`. Reduced-motion respected.
5. Styling: token-driven, matches the row's existing type scale; `tabular-nums` where numeric; no
   hex-alpha on CSS vars. On `<md` the expand still works (§6U.3: log rows reflow to cards, metadata
   expands inline).

### Verify
```bash
cd c:/startup/VisibleAU/src
grep -n "metadata\|aria-expanded\|useState\|Chevron\|expand" components/domain/governance/audit-log-row.tsx
```
On screen (Metropolitan org — it has the 2 hallucination rows with metadata): those rows show an
expand control; expanding reveals `brandId: …`. The residency/benchmark rows (null metadata) show
NO expand control (compact). If you trigger a `member_role_changed` (change a member's role on an
Agency org with ≥2 members), that row's expand should reveal the role-change metadata.

## F20 — residency resource_type is non-canonical (FLAG, do NOT code-fix)
The residency GET passes `resourceType: "data_residency"`, which is NOT in the LLD 8614 enum
(`content_draft | journey | hallucination_incident | feature_flag | competitive_benchmark |
org_member`). It's harmless — residency is a view-only access-log action with no mutated resource,
and `resource_type` is NOT NULL so *something* must be stored; `data_residency` is self-descriptive
and renders fine. `competitive_benchmark` and `hallucination_incident` both match the enum.

Resolution: **leave the code as-is** (do not change the stored value — null isn't allowed on a NOT
NULL column, and "data_residency" is the pragmatic correct choice). Instead:
- [LLD escalation flag for Sri] The LLD 8614 resource_type enum should ADD `data_residency` (and
  note it's an access-log action, not a mutated resource) so canon matches the build and a future
  test asserting `resource_type ∈ enum` doesn't false-fail.
- Do NOT add a UI mapping to hide/rename the badge — the raw value is fine.

Only touch F20 in code if Sri explicitly wants the enum-membership enforced; default is flag-only.

## Constraints
- F21 expand renders ONLY when metadata is present (compact rows otherwise) — do not show an empty
  expand on null-metadata rows.
- Readable key/value rendering, not a raw JSON blob; truncate long ids consistently with existing
  resource_id truncation.
- Token-driven; a11y (`aria-expanded`/`aria-controls`, keyboard); reduced-motion; no hex-alpha;
  responsive inline expand on `<md`.
- F20: flag for canon, no code change (unless Sri opts in).
- Do not touch the audit-trail API, recordAction, or the pagination (all verified correct).

## Report back (paste inline)
1. F21: the audit-log-row before/after; confirmation the 2 hallucination rows show an expand with
   `brandId`, and null-metadata rows stay compact; a11y attributes present.
2. F20: confirmation it's flagged for the LLD (no code change) — or, if Sri opted in, the enum
   enforcement approach.
