# Claude Code — FIX (two related condition/alert gaps): knowledge_panel §240 render condition + in-app consensus alert < 70 (LLD 7252)

Two "wire a condition into existing logic" fixes, both real spec gaps:
- **Bug KP:** knowledge_panel_status renders for ALL entity states incl. "present and accurate" — but §240/canon says
  render ONLY when `knowledge_panel_present=false OR knowledge_panel_accurate=false` (the section flags a PROBLEM; a
  healthy panel is a no-op that shouldn't appear).
- **Bug P1b:** the in-app Action Center consensus alert at `consistency_score < 70` (LLD 7252) is NOT IMPLEMENTED — a
  comment claims "handled in UI" but no code inserts an action_items row. This is DISTINCT from the working EMAIL alert
  at < 60 (LLD 8402). Canon (spec §404-405): "Wire both at their own threshold." The two were historically conflated
  (spec §625-627) — keep them SEPARATE.

Env: Windows repo `C:\startup\VisibleAU\src\`. App runs on LOCAL PROD `visibleau_prod`; dev `visibleau`. Never real prod.
Seeded Metropolitan consensus avg = 67 → in the dead band (≥60 so no email, <70 so SHOULD get in-app — perfect test).

## FIX KP — knowledge_panel_status renders only when present=false OR accurate=false (§240)
```bash
# Find the knowledge_panel case in the narrative generator (currently renders for all states):
grep -n "knowledge_panel\|case \"knowledge_panel_status\"\|knowledge_panel_present\|knowledge_panel_accurate\|present and accurate" lib/communication/narrative-generator.ts
sed -n '244,258p' lib/communication/narrative-generator.ts   # the current case (~line 250)
```
Gate the case so it only produces output when there's a problem:
```ts
case "knowledge_panel_status": {
  const entity = /* the brand_entity_scores row */;
  if (!entity) break;                                   // no data → skip (existing data-gate)
  // §240: only render when the panel is MISSING or INACCURATE — a present+accurate panel is a no-op:
  if (entity.knowledgePanelPresent === true && entity.knowledgePanelAccurate === true) break;  // nothing actionable → OMIT
  // else render: "not found" (present=false) or "present but inaccurate" (accurate=false)
  ...
}
```
- Confirm the exact column names (knowledgePanelPresent / knowledgePanelAccurate) from db/schema.
- After the fix: present=false → renders ("not found"); accurate=false → renders ("present but inaccurate");
  present=true+accurate=true → OMITTED. (Metropolitan is accurate=false → still renders, so the default-path report is
  unchanged for the seeded brand — good.)

## FIX P1b — in-app Action Center consensus alert at < 70 (insert an action_items row)
Canon: `check-cross-platform-consensus` fires the EMAIL alert at avg < 60 (working) AND must create an in-app
action_items row at avg < 70 (LLD 7252, spec §293/§404). Add the in-app insert alongside the existing email path.
```bash
# The existing consensus function + where the email alert fires (add the in-app insert near it):
sed -n '1,80p' inngest/functions/check-cross-platform-consensus.ts
grep -n "avgScore\|< 60\|sendConsensusAlert\|emailOnConsensus\|action\|consistency" inngest/functions/check-cross-platform-consensus.ts
# The action_items insert pattern to MATCH (Phase 1 / other action-item creators — LLD 1040):
grep -rn "db.insert(actionItems\|insert into.*action_items\|actionItems)" inngest/ lib/ | head
grep -n "actionItems\b" db/schema/*.ts | head   # the schema shape (required cols)
```
Add, in check-cross-platform-consensus, after computing avgScore:
```ts
// EMAIL alert (existing) — avg < 60, gated on emailOnConsensus:
if (avgScore < 60) { /* existing sendConsensusAlert(...) */ }

// IN-APP Action Center alert (NEW) — avg < 70 (LLD 7252), DISTINCT threshold, no email-pref gate (it's in-app):
if (avgScore < 70) {
  await db.insert(actionItems).values({
    // match the actionItems schema (brandId/organizationId, type/category, title, description,
    // severity/priority, status 'open', + whatever the existing action-item creators set).
    // e.g. title: "Cross-platform consensus below threshold",
    //      description: `Consensus ${avgScore}/100 across ${n} sources — inconsistent brand facts.`,
    // Follow the EXACT shape the other action_items inserts use (status enum, required fields).
  });
  // Idempotency: avoid duplicate open consensus action_items each cron run — if the schema/UNIQUE allows,
  // upsert or check-existing-open before insert (match how other recurring action items dedupe, if they do).
}
```
- **Keep the thresholds SEPARATE and correct:** in-app at < 70, email at < 60. A brand at 67 gets the in-app action
  item but NOT the email (the dead band the current code leaves silent). Do NOT collapse them to one threshold.
- **Match the actionItems schema exactly** — required columns, the status enum (`open`/etc.), org/brand scoping. Grep an
  existing insert (generate-recommendations.ts or Phase 1) for the exact shape.
- **Dedup:** the consensus cron runs monthly (UPSERT per §0.5) — ensure it doesn't pile up duplicate open consensus
  action_items on each run. If other recurring action items dedupe (check-existing-open, or a UNIQUE), match that; if
  not, a simple "skip if an open consensus action_item already exists for this brand" guard.

## VERIFY — both fixes on real data (local prod, seeded Metropolitan consensus=67)
### KP:
1. Metropolitan (accurate=false) → report STILL shows "Knowledge Panel: present but inaccurate" (renders — condition met).
2. (prove the condition) temporarily set the entity present=true/accurate=true → regenerate → the knowledge_panel
   section is now OMITTED (no "present and accurate" noise line). Revert the entity change.
### P1b:
3. Run check-cross-platform-consensus for Metropolitan (avg 67) → an action_items row is CREATED (avg < 70), visible in
   the Action Center. And NO email alert (avg ≥ 60) — confirming the distinct thresholds.
4. (prove the boundary) a brand with avg 55 → BOTH the in-app action item (<70) AND the email alert (<60). A brand with
   avg 75 → NEITHER. Confirm the two thresholds behave independently.
5. Re-run the cron → no DUPLICATE open consensus action_item (dedup works).
Report: KP omits when healthy / renders when problem; P1b creates the in-app item at <70, email only at <60, no dupes.

## Report
- KP: knowledge_panel case now gated on present=false OR accurate=false (§240); healthy panel omitted, problem panel
  rendered; Metropolitan unchanged (accurate=false still shows).
- P1b: in-app action_items insert at avg < 70 (LLD 7252), distinct from the < 60 email; matches actionItems schema;
  deduped across cron runs.
- Boundary proof: 67 → in-app only; 55 → both; 75 → neither.
- Confirm the existing email consensus alert (< 60) still works (not broken by adding the in-app path).

## Constraints
- Two SEPARATE thresholds — in-app < 70 (LLD 7252), email < 60 (LLD 8402). Do NOT conflate (spec §625-627 warns they
  were previously conflated). A 60-69 brand gets in-app but not email — that's the intended behavior.
- KP: OMIT the section only for present=true AND accurate=true; render for the other states (don't over-omit).
- action_items insert MUST match the existing schema/enum/scoping — grep a real insert; don't invent fields.
- Dedup the recurring consensus action item (monthly cron) — no pile-up of duplicate open items.
- Verify on real data (Metropolitan 67 for P1b; toggle entity for KP). Local prod, never real prod.
- LLD v8.70 / §240 / LLD 7252 / LLD 8402 win.

## NOTE
Two condition/alert gaps. KP: the knowledge_panel section renders even for a present+accurate panel (noise); §240 says
render only when present=false OR accurate=false — gate it, so a healthy panel omits the section (Metropolitan stays
rendered, accurate=false). P1b: the in-app Action Center consensus alert at < 70 (LLD 7252) was never built (comment
lied); add a db.insert(actionItems) at avg < 70, DISTINCT from the working < 60 email alert (LLD 8402) — the two were
historically conflated, keep them separate, so a 60-69 brand gets the in-app item but no email. Match the actionItems
schema, dedupe the monthly cron. Verify on real data: the seeded consensus=67 is exactly in the dead band that should now
produce an in-app item and no email.
