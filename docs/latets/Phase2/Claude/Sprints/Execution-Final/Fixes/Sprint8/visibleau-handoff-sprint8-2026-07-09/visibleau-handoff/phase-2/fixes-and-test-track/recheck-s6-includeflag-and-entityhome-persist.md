# Claude Code — RE-CHECK 2 S6 audit verdicts against canon: (A) the include:false report slots, (B) entity-home not persisting

The S6 post-build audit returned "0 bugs, ready to ship" — but it reached two verdicts by assuming intent that canon
appears to contradict. Re-check BOTH against the LLD (v8.70) + the S6 prompt, on real data (migrations now applied).
These are linked: (B) is the deeper bug; (A) sits on top of it.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev `visibleau` + local prod `visibleau_prod` (migrations 0018/0019 now
applied to BOTH). Never real prod. LLD v8.70 WINS.

## RE-CHECK A — are entity_home_status + agent_readiness supposed to be DEFAULT-ON (include:true) or OPT-IN (include:false)?
The audit found both at `include: false` in default-report-template.ts and called it "correct opt-in." But the S6 prompt
says the OPPOSITE, four times:
- "After this, ALL 12 S4 report sections are wired" (prompt lines 47, 306)
- §13 anti-pattern: "Forgetting the S4 wiring → entity_home_status + agent_readiness stay DORMANT in S4 reports; this
  sprint is what LIGHTS THEM UP" (line 655)
- "all 12 S4 narrative-generator slots [wired]" (line 660)
`include: false` = they stay DORMANT on the default path = the exact §13 anti-pattern. This looks like the S5 Bug-A
class (wired to the generator, excluded from the default report → dead for customers), NOT intentional opt-in.

### A1 — Confirm against the LLD wiring spec (the tiebreaker)
```bash
# The LLD region the prompt cites for the wiring (8966-8983) — does it say default-on or opt-in?
sed -n '8966,8990p' <the LLD file> | grep -niE "entity_home|agent_readiness|include|default|opt-in|section|render|dormant|light"
# How the OTHER (S5) sections that were "lit up" are set — the precedent:
grep -n "linkedin_performance\|consensus_score\|knowledge_panel_status\|source_type_gaps\|evidence_snapshots\|entity_home_status\|agent_readiness\|include" db/seed/default-report-template.ts
```
Report: (a) does the LLD 8966-8983 wiring spec say these 2 sections should render by default, or be opt-in? (b) are the
5 S5 sections `include: true` while the 2 S6 sections are `include: false`? If the S5 five are true and these two are
false with no canon basis for the difference → that's the inconsistency (they should match — all "lit up" sections
default-on).

### A2 — Real-data smoke: do they render on the DEFAULT path?
Seed content_structure_audits (entity-home cols populated) + agent_readiness_scores rows for Metropolitan → generate a
report on the DEFAULT template (no hand-inserted template) → do entity_home_status + agent_readiness sections RENDER?
- With `include: false` they will NOT render (dormant) — confirming the gap.
- Per the prompt's "all 12 wired/lit up", they SHOULD render.
Report: do they render on the default path? If not, and the LLD says they should → flip to `include: true` + re-seed
existing orgs (the S5 Bug-A fix), and confirm they render. If the LLD genuinely says opt-in → the audit was right, leave
false, but state the canon citation that says opt-in.

## RE-CHECK B — does auditEntityHomeFn PERSIST the entity-home cols? (F-3, rated Low — canon says it's a real bug)
The audit found auditEntityHomeFn "computes but doesn't persist," and the entity-home API "uses a URL heuristic instead"
→ the entity-home screen shows content-audit data, NOT the real entity-home fields (orgSchema, @id, sameAs). But the S6
prompt is explicit that it MUST persist:
- entity-home-auditor.ts "**Writes the content_structure_audits entity-home cols**" (prompt line 263)
- audit-entity-home.ts "**updates the content_structure_audits entity-home cols on the confirmed row**" (lines 448-449)
- The cols exist: entity_home_has_org_schema, entity_home_has_id_field, entity_home_same_as_count,
  is_entity_home_candidate, entity_home_page_url (lines 209-211).
So canon REQUIRES persistence into those cols. "Computes but doesn't persist" = a spec violation, and the screen showing
a URL heuristic instead = wrong data on screen. That's not Low.

### B1 — Confirm whether it persists
```bash
sed -n '1,80p' inngest/functions/audit-entity-home.ts
grep -n "update\|insert\|set\|entity_home_has_org_schema\|entity_home_has_id_field\|entity_home_same_as_count\|is_entity_home_candidate\|content_structure_audits\|db\." inngest/functions/audit-entity-home.ts lib/retrieval/entity-home-auditor.ts | head -25
# Does the entity-home API route read the REAL cols, or a URL heuristic over content_structure_audits?
grep -n "entity_home_has_org_schema\|entity_home_same_as_count\|is_entity_home_candidate\|heuristic\|url.*includes\|about\|pageUrl" app/api/brands/**/entity-home*/route.ts app/api/brands/**/*entity-home*/route.ts | head
```
Report: (a) does auditEntityHomeFn actually UPDATE the content_structure_audits entity-home cols (per line 448-449), or
does it only return+emit without persisting? (b) does the entity-home API read those real cols, or a URL heuristic?
If it doesn't persist / the route reads a heuristic → confirmed spec violation, wrong data on screen. Re-rate above Low.

### B2 — The link to Re-check A
The entity_home_status REPORT section reads the content_structure_audits entity-home cols. If B shows those cols aren't
populated (auditEntityHomeFn doesn't persist), then even flipping include:true (Re-check A) renders an EMPTY/heuristic
section. So B is the deeper fix. Report whether the entity_home_status section's data source is the (unpopulated) real
cols or the heuristic — i.e. would fixing A alone give a correct section, or does B need fixing first?

## VERDICT — report both, with canon citations:
- **Re-check A:** does the LLD (8966-8983) say entity_home_status + agent_readiness render by default or opt-in? Do the
  S5 five differ from the S6 two (true vs false)? Do the 2 render on the default path? → CONFIRM whether include:false
  is a bug (flip to true + re-seed) or correct (cite the opt-in spec).
- **Re-check B:** does auditEntityHomeFn persist the entity-home cols per canon (lines 263/448-449)? Does the entity-home
  page/section read the real cols or a heuristic? → CONFIRM F-3 is a real spec-violation bug (re-rate) and whether it
  gates Re-check A.
NO fixes this pass unless the finding is unambiguous — report the canon citation + the real-data result, then we scope
fixes.

## Constraints
- LLD v8.70 is the tiebreaker on BOTH — cite the actual lines (A: 8966-8983 wiring; B: 5740/5820 entity-home persist).
- The real-data smokes decide it: (A) generate a default-path report — do the 2 sections render? (B) run auditEntityHome
  → is a real row's entity_home_* cols populated, and does the page show them or a heuristic?
- Do NOT accept "opt-in by design" (A) or "Low" (B) without the canon citation that supports it — the audit asserted
  both without citing canon; this re-check demands the citation.
- Migrations 0018/0019 are applied to BOTH DBs now — the smokes can run.

## NOTE
The S6 audit said "0 bugs, ready to ship" but reached two verdicts by assuming intent canon appears to contradict.
(A) It called the report slots' `include: false` "correct opt-in" — but the prompt says four times these sections should
be "lit up / all 12 wired / not dormant"; include:false leaves them dormant (the S5 Bug-A pattern). (B) It rated F-3
"Low" — but canon (lines 263, 448-449) says auditEntityHomeFn MUST persist the entity-home cols, and the audit found it
doesn't (page shows a URL heuristic instead) = spec violation + wrong data on screen. These link: the report section
reads those cols, so B (persistence) is the deeper fix and A (include flag) sits on top. Re-check both against LLD
v8.70 with real-data smokes; report the canon citation that decides each.
