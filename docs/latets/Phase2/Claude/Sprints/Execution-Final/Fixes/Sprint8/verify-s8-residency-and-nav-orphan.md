# VERIFY S8 — DR-01 residency rows (close HIGH-02) + nav-reachability of the 3 governance screens (nav-orphan check)

## Purpose
Two open items before the manual walk of Sprint 8's governance screens can start. Both are
READ-ONLY diagnosis (no source edits, no schema changes) — gather facts + report inline. Any
actual fix will be a separate prompt scoped from what this finds.

1. **Close HIGH-02** — confirm the DR-01 residency writer actually populated rows after wiring.
   (The table existing ≠ the writer ran. Canon requires 7 rows/org.)
2. **Nav-orphan check** — the recurring bug that shipped 3× (S5 Trust, S6 Retrieval, S7 Discovery):
   the layer's PAGE gets built but the NAV ENTRY that reaches it is forgotten, so the feature is
   unreachable except by typing the URL. S8 has 3 new settings screens — confirm each is linked
   from the actual UI, not stranded.

---

## PART A — HIGH-02 residency verification (both DBs)

### A1 — Resolve the two connection strings (do not hardcode)
```bash
cd c:/startup/VisibleAU/src
grep -RnE "visibleau_prod|DATABASE_URL" .env .env.local .env.production.local 2>/dev/null
```
Use the real `visibleau` (dev) and `visibleau_prod` (prod) strings below as `$DEV` / `$PROD`.

### A2 — Dump residency rows for the validation org, on BOTH DBs
```bash
for LABEL in DEV PROD; do
  CONN=$([ "$LABEL" = DEV ] && echo "$DEV" || echo "$PROD")
  echo "=== $LABEL ==="
  psql "$CONN" -c "
    SELECT data_type, storage_region, provider, retention_period, encryption_status
    FROM data_residency_log
    WHERE organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9'
    ORDER BY data_type;"
  psql "$CONN" -c "
    SELECT count(*) FILTER (WHERE organization_id='da1071de-6dbd-4e08-8f43-29f76c123be9') AS metro_rows,
           count(DISTINCT organization_id) AS orgs_with_rows,
           count(*) AS total_rows
    FROM data_residency_log;"
done
```

### A3 — Judge against canon (LLD 8733–8743)
EXPECT for BOTH DBs: the Metropolitan org has **exactly 7 rows** —
`audit_data`, `evidence_snapshots`, `pdf_reports`, `llm_cache`, `crawler_logs`,
`llm_processing_openai`, `llm_processing_anthropic`.
Value spot-check: the 3 stored classes → `ap-southeast-2` / `supabase` / `12 months`;
`llm_cache` → `30 days`; `crawler_logs` → `90 days`; both `llm_processing_*` → region `us`,
provider `openai` / `anthropic`. And `orgs_with_rows` should equal the org count in that DB
(every org backfilled), not 1.
Report the classification: **7 (pass) / 5 / 0 / other** for each DB. Do NOT fix here — if not 7,
report the dump and stop; a scoped fix follows.

---

## PART B — Nav-orphan check for the 3 governance settings screens

The three screens (from the S8 build): `app/(auth)/settings/team/page.tsx`,
`app/(auth)/settings/audit-trail/page.tsx`, `app/(auth)/settings/data-residency/page.tsx`.

### B1 — Do the page routes exist and export a component?
```bash
for P in team audit-trail data-residency; do
  echo "=== settings/$P ==="
  ls "app/(auth)/settings/$P/page.tsx" 2>/dev/null || echo "PAGE FILE MISSING"
done
```

### B2 — Is each route LINKED from the app's navigation? (the actual orphan test)
Find the nav/sidebar component(s) and check whether the three routes are referenced. The sidebar
seen in-app shows an ACCOUNT group (Webhooks, View plans) — check whether Team / Audit trail /
Data residency are present there or anywhere clickable.
```bash
# Locate nav / sidebar / settings-layout components:
grep -Rln "Webhooks\|View plans\|/settings\|nav\|sidebar" app/ components/ | grep -iE "nav|sidebar|layout|settings" | grep -v test | sort -u
# Then check for links to each governance route across the whole app:
for R in "settings/team" "settings/audit-trail" "settings/data-residency"; do
  echo "=== href/link to /$R ==="
  grep -Rn "\"/$R\"\|'/$R'\|/$R" app/ components/ | grep -v "page.tsx:" | grep -viE "test|\.md"
done
# Is there a settings INDEX/layout with tabs that would surface them?
ls "app/(auth)/settings/" && cat "app/(auth)/settings/layout.tsx" 2>/dev/null | head -60
cat "app/(auth)/settings/page.tsx" 2>/dev/null | head -60
```

### B3 — Classify each of the 3 screens
For each route report one of:
- **LINKED** — there is a nav entry / tab / link that routes to it (name the file + the link text).
- **ORPHAN** — the page exists but NOTHING in app/ or components/ links to it (reachable only by
  typing the URL). This is the S5/S6/S7 pattern — it would be a finding.
- **PARTIAL** — reachable only from an unexpected/awkward place (say where).

Note: a repo-wide grep guard from S7 asserts the BRAND-page nav references each layer route — that
guard is about brand-detail tiles, NOT these org-level settings screens, so it will not catch a
settings-nav orphan. Confirm whether any settings-level nav assertion exists:
```bash
grep -Rn "settings/team\|settings/audit-trail\|settings/data-residency" tests/ scripts/ 2>/dev/null
```

---

## Constraints
- READ-ONLY. Do not edit source, schema, or nav in this prompt. Do not run the residency writer
  again here (HIGH-02 already wired it; this only READS the result). Do not weaken any check to
  make it pass.
- Use the project's real connection strings from the env files, not examples.

## Report back (paste inline)
1. **Part A:** the A2 row dump + counts for BOTH DBs, and the 7/5/0/other classification per DB.
2. **Part B:** for each of the 3 screens — LINKED / ORPHAN / PARTIAL, with the nav file + link text
   (or the confirmation that nothing links to it), and whether any settings-nav test guard exists.
