# DIAGNOSE S8 — audit-trail screen: resource_type badge vs canon enum (F20) + metadata-expand present? (F21)

## Purpose
Three-source verification of settings/audit-trail (the prototype has NO audit-trail screen, so the
authorities are S8 prompt §6U.3 + the LLD action/resource_type enum). The rendered screen is largely
correct, but two items need confirmation against the build. READ-ONLY — classify + report, no edits.

## Canon
- **S8 prompt §6U.3:** `audit-log-row.tsx: action + resource_type + actor (user or "system" when
  user_id null) + timestamp (tabular-nums) + **metadata expand**. Paginated.`
- **LLD 8614 resource_type enum (Phase 2):** `content_draft | journey | hallucination_incident |
  feature_flag | competitive_benchmark | org_member`. NOTE: there is **no `data_residency`
  resource_type** — the residency action is `data_residency_accessed` (an ACTION), and residency
  has no resource_type row in the enum.

## Findings to confirm

### F20 — the residency rows show a `[data_residency]` badge, but that's not a canonical resource_type
The audit-trail rows render a resource_type badge; `[competitive_benchmark]` matches the enum, but
`[data_residency]` does not appear in the LLD resource_type list. Determine what's actually stored
vs what's displayed.

```bash
cd c:/startup/VisibleAU/src
# What resource_type does the residency GET route pass to recordAction?
grep -n "recordAction\|resourceType\|resource_type\|data_residency\|competitive_benchmark" \
  "app/api/organizations/[orgId]/data-residency/route.ts" \
  "app/api/brands/[brandId]/competitive-benchmark/route.ts"
# What's actually in the DB for these rows?
psql "$PROD" -c "
  SELECT DISTINCT action, resource_type
  FROM audit_trail
  ORDER BY action;"
# How does the row component derive the badge — from resource_type, or from the action name?
grep -n "resource_type\|resourceType\|badge\|action\|data_residency\|competitive" \
  components/domain/governance/audit-log-row.tsx
```
CLASSIFY:
- If the DB `resource_type` for residency rows is literally `data_residency` → the residency route
  passes a non-canonical resource_type to recordAction (canon has no such value). Minor, but it
  should either be null/omitted (residency has no resource) or the enum should be extended — flag
  which, don't fix.
- If the DB stores null/empty and the BADGE is derived from the action name in the component → the
  badge is a UI invention; decide whether that's acceptable display or should be suppressed for
  actions with no canonical resource_type.
- If `competitive_benchmark` matches and only residency is off → smallest possible fix.

### F21 — is the metadata-expand affordance built, or just hidden because these rows have no metadata?
§6U.3 requires a metadata expand. The rendered rows show no expand control.
```bash
grep -n "metadata\|expand\|Chevron\|collapse\|<details\|onClick.*expand\|useState.*open\|aria-expanded" \
  components/domain/governance/audit-log-row.tsx "app/(auth)/settings/audit-trail/page.tsx"
# Do the existing rows even HAVE metadata to expand?
psql "$PROD" -c "
  SELECT action, (metadata IS NOT NULL) AS has_metadata, metadata
  FROM audit_trail
  ORDER BY created_at DESC LIMIT 10;"
```
CLASSIFY:
- If there's an expand control in the component that renders only when `metadata` is present, AND
  the current rows have null metadata → the expand is BUILT + correctly hidden-when-empty. Not a bug
  (just needs a row with metadata to see it). Confirm by noting a row that has metadata, if any.
- If there is NO expand affordance in the component at all → the §6U.3 "metadata expand" is NOT
  built → a real spec gap (LOW-MED). Flag for a fix.
- If some audited actions SHOULD write metadata but currently pass none (so nothing ever expands) →
  note which actions omit metadata that canon implies they should carry (e.g. what changed on a
  member_role_changed) — separate consideration.

## Constraints
- READ-ONLY. No edits, no writes to audit_trail. Classify against canon; do not fix.
- Use the real `$PROD` connection string from env.

## Report back (paste inline)
1. F20: the DB `DISTINCT action, resource_type` list; what the residency + benchmark routes pass;
   whether the badge is a stored value or a UI-derived label; the classification.
2. F21: whether an expand affordance exists in audit-log-row.tsx; whether current rows have metadata;
   the classification (built+hidden vs not-built vs actions-omit-metadata).
