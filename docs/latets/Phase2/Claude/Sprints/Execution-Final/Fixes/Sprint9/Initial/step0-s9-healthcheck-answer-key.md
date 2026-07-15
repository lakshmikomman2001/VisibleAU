# S9 STEP 0 — Health Check answer key (read-only): the raw dimension values + which brand to walk

## Why
Before opening the Health Check page, we need the EXPECTED traffic-light band for each dimension.
Without this, a "green" light looks correct whether the underlying score is 85 (right) or 45 (wrong)
— a plausible-but-wrong band is invisible without a pre-computed answer key.

Also: the dashboard's recent audits are all **Metropolitan Plumbing**, while the Health Check banner
points at **Bondi Plumbing**. If Bondi has NO completed audit, its Health Check will render the
pre-audit state ("Run your first audit…") and we can't test the threshold logic there — in which
case we walk **Metropolitan** instead. This step decides which.

READ-ONLY. No edits, no writes.

## Task — run these against `visibleau_prod`

### 1 — Which brands have completed audits? (decides which brand to walk)
```bash
cd c:/startup/VisibleAU/src
psql "$PROD" -c "
  SELECT b.id, b.name, b.domain, b.vertical,
         COUNT(a.id) FILTER (WHERE a.status='complete') AS completed_audits,
         MAX(a.created_at) FILTER (WHERE a.status='complete') AS latest_audit
  FROM brands b
  LEFT JOIN audits a ON a.brand_id = b.id
  GROUP BY b.id, b.name, b.domain, b.vertical
  ORDER BY completed_audits DESC, b.name;"
```
→ Pick the walk brand: one WITH completed audits (ideally Bondi if it has any; otherwise
Metropolitan). Call it `$BRAND` below and TELL ME which you used + its id.

### 2 — AI SENTIMENT + AI PRESENCE (from the latest completed audit)
```bash
psql "$PROD" -c "
  SELECT a.id, a.score_sentiment_numeric, a.score_frequency, a.score_composite, a.created_at
  FROM audits a
  WHERE a.brand_id = '<BRAND_ID>' AND a.status='complete'
  ORDER BY a.created_at DESC LIMIT 3;"
```

### 3 — SITE READINESS (technical audit)
```bash
psql "$PROD" -c "
  SELECT score_composite, created_at
  FROM technical_audits
  WHERE brand_id = '<BRAND_ID>'
  ORDER BY created_at DESC LIMIT 3;"
```

### 4 — LOCAL AUTHORITY (expected NULL per S6b-02)
```bash
psql "$PROD" -c "
  SELECT local_ai_trust_score, agent_readiness_score, created_at
  FROM agent_readiness_scores
  WHERE brand_id = '<BRAND_ID>'
  ORDER BY created_at DESC LIMIT 3;"
```

### 5 — The #1 ACTION (5th section)
```bash
psql "$PROD" -c "
  SELECT id, title, status, priority, created_at
  FROM remediation_tasks
  WHERE brand_id = '<BRAND_ID>' AND status='open'
  ORDER BY priority ASC LIMIT 3;"
```

### 6 — Is the walk brand SaaS? (decides whether Local Authority should be HIDDEN entirely)
```bash
psql "$PROD" -c "SELECT id, name, vertical FROM brands WHERE id = '<BRAND_ID>';"
# Also: what vertical values exist, and which are treated as SaaS by the code?
grep -rn "saas\|SaaS\|isSaas\|vertical.*saas\|skipLocal\|hideLocal" \
  components/domain/health-check/*.tsx lib/**/health*.ts app/api/brands/**/health*/**/*.ts 2>/dev/null | head
```

## Now fill in the ANSWER KEY (this is what I grade the screen against)
| Dimension | Source | LLD thresholds | **Actual value** | **Expected band** |
|---|---|---|---|---|
| AI SENTIMENT | `audits.score_sentiment_numeric` | green **≥70** · amber **40–69** · red **<40** | ? | ? |
| AI PRESENCE | `audits.score_frequency` | green **≥60** · amber **30–59** · red **<30** | ? | ? |
| SITE READINESS | `technical_audits.score_composite` | green **≥75** · amber **45–74** · red **<45** | ? | ? |
| LOCAL AUTHORITY | `agent_readiness_scores.local_ai_trust_score` | NULL per S6b-02 | ? | **skip/null state** (NOT 0, NOT red) |
| #1 ACTION | top open `remediation_task` by priority | — | ? | the real task title |

**⚠️ FLAG ANY BOUNDARY VALUE.** If a score is within ±2 of a threshold (70, 60, 75, 40, 30, 45),
say so explicitly — that's where an off-by-one (`>` vs `>=`) hides, and it's the highest-value check
on the whole screen.

## Report back (paste inline)
1. The brand list (step 1) + **which brand you'll walk** (id + name) and why.
2. The raw values (steps 2–5).
3. **The completed ANSWER KEY table** — actual value + expected band per dimension.
4. Any **boundary value** (within ±2 of a threshold).
5. Is the walk brand SaaS? (→ should Local Authority be hidden entirely, or shown as a null/skip
   state?) + what the code treats as SaaS.
6. The #1 action's title (so I can check the screen shows the REAL one, not a placeholder).
