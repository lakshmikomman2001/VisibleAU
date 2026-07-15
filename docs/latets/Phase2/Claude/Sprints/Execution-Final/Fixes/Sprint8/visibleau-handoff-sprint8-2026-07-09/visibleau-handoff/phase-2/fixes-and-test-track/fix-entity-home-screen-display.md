# Claude Code — FIX: Entity Home screen shows content-structure data, not the entity-home fields (Bug B's display half)

The Entity Home screen (`/brands/[id]/retrieval/entity-home`, entity-home-status.tsx) renders CONTENT-STRUCTURE fields
(Citation 45% · Capsule 72/4 · Format expert_article · Pages 2) — but §6U.6 says it must show the ENTITY-HOME audit
fields: **@id present · sameAs count (target ≥3) · org-schema present · gaps**. This is the display half of Bug B: the
fix updated the API route + narrative-generator to read the real entity-home cols, but this SCREEN still renders the old
content-structure fields. The DATA is correct (smoke confirmed sameAs=4, org-schema=true, @id=true in the DB + the route
returns them) — the component just isn't displaying it. Wire the display to the entity-home data.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand
418f321f-2489-4560-aaa9-895728580465 (/about is the entity home; sameAs=4, org-schema present, @id present).

## What it should show (canon)
§6U.6 (prompt line 352): "**@id present / sameAs count (target ≥3) / org-schema present / the gaps with
recommendations.**"
Prototype (2724-2737) — the exact card:
- Header: "Entity Home" + a **status badge** (Complete/Incomplete based on @id + sameAs≥3 + org-schema)
- Line: "Page found: /about — [status sentence]"
- Detail: "**sameAs count: X/3 required · @id: present/missing**"
- If gaps (sameAs<3 or @id missing or org-schema missing): a **"Fix entity schema →"** action + the gap list
STATES: empty (no entity home identified) → "We haven't identified your Entity Home yet — run an audit"; loading
skeleton; error boundary.

## STEP 1 — Confirm the data source + what the component currently renders
```bash
cat "app/(auth)/brands/[brandId]/retrieval/entity-home/page.tsx"
cat components/domain/retrieval/entity-home-status.tsx
# What the Bug-B-fixed route returns (the entity-home object the page should read):
grep -n "orgSchemaPresent\|idFieldPresent\|sameAsCount\|isEntityHomeCandidate\|entityHomeStatus\|pageUrl\|Citation\|Capsule\|Format\|citation_prob\|capsule\|content_format" app/api/brands/[brandId]/entity-home/route.ts
```
Report: (a) what fields the component currently renders (the content-structure ones — Citation/Capsule/Format); (b) what
the entity-home API route returns (the Bug-B fix added orgSchemaPresent/idFieldPresent/sameAsCount) — is the page
reading that object, or the content-structure fields? The bug is the component renders content-structure data instead of
the entity-home status object.

## STEP 2 — Render the ENTITY-HOME fields (not content-structure)
Update entity-home-status.tsx (and page.tsx if it shapes the data) to display, per §6U.6 + prototype 2734:
- **@id present:** from `idFieldPresent` (entity_home_has_id_field) → "@id: present" / "@id: missing"
- **sameAs count:** from `sameAsCount` (entity_home_same_as_count) → "sameAs count: 4/3 required" (X/3; ≥3 = met)
- **org-schema present:** from `orgSchemaPresent` (entity_home_has_org_schema) → "Organisation schema: present/missing"
- **Status badge:** Complete when @id present AND sameAs≥3 AND org-schema present; else Incomplete (prototype uses a
  warning "Incomplete" pill).
- **Gaps + action:** when sameAs<3 OR @id missing OR org-schema missing → show the gap(s) + a "Fix entity schema →"
  action (per prototype 2739). For Metropolitan (sameAs=4, @id present, org-schema present) → likely Complete, few/no
  gaps.
- Keep the page URL line (/about — that's correct).
- REMOVE the content-structure fields (Citation %, Capsule X/4, Format, Passages) from THIS card — those belong on the
  Content Structure screen, not Entity Home. (If the "Audited Pages" section below is genuinely content-structure data,
  that may be a separate question — see STEP 3.)

## STEP 3 — The "Audited Pages" section — is it correct here, or content-structure bleed?
The screen also shows an "Audited Pages" list (/services 22%, /about 45% — with Capsule/Passages/Format/freshness). That
is CONTENT-STRUCTURE per-page data. Check §6U.6: does the Entity Home screen spec include a per-page content list, or is
that Content Structure's screen?
```bash
grep -n "Audited Pages\|per-page\|page list\|content.structure.*entity\|entity.*content.structure" /tmp/s6bundle/visibleau-p2-sprint-6-prompt.md prototype/visibleau-phase2-prototype-FIX17.jsx | head
```
Report: is the "Audited Pages" content list SUPPOSED to be on the Entity Home screen (§6U.6 is "single-column status +
gap list" — which does NOT mention a per-page content grid), or is it Content Structure data bleeding onto the wrong
screen? If §6U.6 says Entity Home = status + gaps only, the per-page content grid may belong on /content-structure, not
here. Report — don't remove it blindly if unsure; flag for a decision.

## STEP 4 — Verify on screen (real data — the smoke already proved the cols)
Reload `/brands/418f321f.../retrieval/entity-home`:
- The Entity Home card shows **@id: present · sameAs count: 4/3 required · Organisation schema: present** (the real
  entity-home data — matching the smoke: sameAs=4, org-schema=true, @id=true).
- Status badge reflects it (Complete, since all 3 met).
- NOT Citation/Capsule/Format on the Entity Home status card.
- The empty state still works if a brand has no entity home identified.
Report: the Entity Home card shows @id/sameAs/org-schema (real data), not content-structure fields.

## STEP 5 — Report
- The component now renders @id/sameAs/org-schema per §6U.6 (reading the Bug-B route's entity-home object), not
  content-structure fields.
- STEP 3 result: is the "Audited Pages" content grid correct on Entity Home, or does it belong on Content Structure?
  (report; fix separately if it's bleed).
- On screen: real entity-home data (sameAs 4/3, @id present, org-schema present).
- Add/adjust a test: the entity-home component renders sameAsCount/idFieldPresent/orgSchemaPresent (seed the cols,
  assert the fields show; re-break: point it back at content-structure fields → fail). This is the guard that would have
  caught this — Bug B was verified via the API + report, but NOT this screen.

## Constraints
- Render the ENTITY-HOME fields (@id/sameAs/org-schema/gaps) per §6U.6 + prototype 2734 — NOT content-structure
  (Citation/Capsule/Format). The data's already correct (smoke-proven) — this wires the display to it.
- sameAs threshold is ≥3 (X/3 required); @id present/missing; org-schema present/missing; status badge from all three.
- STEP 3 (Audited Pages content grid) — VERIFY against §6U.6 before removing; may be content-structure bleed, may be
  intended. Report, decide.
- Verify on screen (real @id/sameAs/org-schema). Local prod, never real prod.
- LLD v8.70 / §6U.6 / prototype 2724-2740 win.

## NOTE
The display half of Bug B. The Entity Home screen renders content-structure fields (Citation/Capsule/Format) but §6U.6 +
prototype 2734 require the entity-home audit fields: @id present · sameAs count X/3 · org-schema present · gaps + a "Fix
entity schema" action + a status badge. The DATA is correct (smoke proved sameAs=4/org-schema=true/@id=true in the DB and
the Bug-B route returns them) — the component just isn't reading/rendering the entity-home object. Wire entity-home-
status.tsx to the entity-home fields per §6U.6. Also verify whether the "Audited Pages" content grid belongs here or on
Content Structure (§6U.6 says Entity Home = status + gap list, no per-page content grid — possible bleed). Verify on
screen: sameAs 4/3, @id present, org-schema present — not Citation/Capsule/Format. Bug B was verified via the API +
report but NOT this screen — add the component test that would have caught it.
