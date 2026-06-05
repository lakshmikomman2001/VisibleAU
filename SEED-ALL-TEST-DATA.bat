@echo off
REM ============================================================
REM  VisibleAU — Seed ALL Test Data (Sprints 1-6)
REM  Creates: org, user, brand, audit, citations, action items
REM  Safe to re-run — uses ON CONFLICT / idempotent patterns
REM  Also runs: pnpm seed (vertical packs + research citations)
REM ============================================================
setlocal EnableDelayedExpansion

cd /d "%~dp0"
set PGPASSWORD=password
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"

echo.
echo ============================================================
echo   VisibleAU — Seeding ALL Test Data (Sprints 1-6)
echo ============================================================
echo.

REM ── Step 1: Vertical packs + research citations (pnpm seed) ──
echo [1/5] Running pnpm seed (336 vertical pack prompts + 12 research citations)...
call pnpm seed
echo.

REM ── Step 2: Organization ──────────────────────────────────────
echo [2/5] Seeding organization (VisibleAU Dev, agency tier)...
%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO organizations (id, clerk_org_id, name, tier, region, metadata, created_at, updated_at) VALUES (gen_random_uuid(), 'YOlMjajxQPtDqAMdblehOhhFDXGDiuBi', 'VisibleAU Dev', 'agency', 'au', '{}', NOW(), NOW()) ON CONFLICT (clerk_org_id) DO UPDATE SET tier='agency', name='VisibleAU Dev'" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM organizations WHERE clerk_org_id='YOlMjajxQPtDqAMdblehOhhFDXGDiuBi'"`) do set ORG_ID=%%I
echo       Org ID: %ORG_ID%

REM ── Step 3: User + Brand ──────────────────────────────────────
echo [3/5] Seeding user (Sri Komman) + brand (Bondi Plumbing)...
%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO users (id, clerk_user_id, organization_id, email, name, role, created_at, updated_at) VALUES (gen_random_uuid(), '4Fc7RPQaytFN7dqHAwOsjG8XrbteBYpY', '%ORG_ID%', 'sri@visibleau.local', 'Sri Komman', 'owner', NOW(), NOW()) ON CONFLICT (clerk_user_id) DO UPDATE SET email='sri@visibleau.local', name='Sri Komman', organization_id='%ORG_ID%'" >nul 2>&1

%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO brands (id, organization_id, name, domain, vertical, region, competitors, primary_regions, created_at, updated_at) VALUES (gen_random_uuid(), '%ORG_ID%', 'Bondi Plumbing', 'bondiplumbing.com.au', 'tradies', 'au', ARRAY['Eastern Plumbing','Sydney Pipe Pros'], ARRAY['NSW:Bondi','NSW:Sydney CBD'], NOW(), NOW()) ON CONFLICT DO NOTHING" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM brands WHERE organization_id='%ORG_ID%' AND name='Bondi Plumbing' LIMIT 1"`) do set BRAND_ID=%%I
echo       Brand ID: %BRAND_ID%

REM ── Step 4: Audits + Citations ────────────────────────────────
echo [4/5] Seeding audits + citations...

REM Audit #1: good scores (for dashboard display)
%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO audits (id, brand_id, organization_id, audit_number, status, triggered_by, engines, prompts_count, runs_per_prompt, total_calls, score_composite, score_frequency, score_position, score_sentiment, score_sentiment_numeric, score_context, score_context_numeric, score_accuracy, score_confidence_low, score_confidence_high, confidence_intervals, total_cost_usd, metadata, started_at, completed_at, created_at) VALUES (gen_random_uuid(), '%BRAND_ID%', '%ORG_ID%', 1, 'complete', 'manual', ARRAY['chatgpt','claude','gemini','perplexity'], 10, 5, 200, '68.50', '70.00', '85.00', 'positive', '75.00', 'listed', '50.00', '60.00', '62.30', '74.70', '{\"frequency\":{\"lower\":55.2,\"upper\":82.1},\"position\":{\"lower\":70.5,\"upper\":95.0},\"sentiment\":{\"lower\":60.0,\"upper\":88.0},\"context\":{\"lower\":35.0,\"upper\":65.0},\"accuracy\":{\"lower\":45.0,\"upper\":75.0},\"composite\":{\"lower\":62.3,\"upper\":74.7}}', '2.4500', '{}', NOW() - INTERVAL '10 minutes', NOW(), NOW()) ON CONFLICT DO NOTHING" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM audits WHERE organization_id='%ORG_ID%' AND audit_number=1 LIMIT 1"`) do set AUDIT1_ID=%%I
echo       Audit #1 ID: %AUDIT1_ID% (score 68.5)

REM Citations for audit #1
for %%E in (chatgpt claude gemini perplexity) do (
  %PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO citations (id, audit_id, engine, prompt, run_number, brand_mentioned, position, sentiment_label, context_label, response_snippet, cited_sources, llm_cost_usd, llm_tokens_used, llm_model, created_at) VALUES (gen_random_uuid(), '%AUDIT1_ID%', '%%E', 'Best plumber in Sydney?', 1, true, 2, 'positive', 'recommended', 'Bondi Plumbing is highly recommended for emergency plumbing services in Sydney.', '[{\"domain\":\"bondiplumbing.com.au\",\"url\":\"https://bondiplumbing.com.au\"}]', '0.0050', 85, 'gpt-4o-mini', NOW()) ON CONFLICT DO NOTHING" >nul 2>&1
  %PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO citations (id, audit_id, engine, prompt, run_number, brand_mentioned, position, response_snippet, cited_sources, llm_cost_usd, llm_tokens_used, llm_model, created_at) VALUES (gen_random_uuid(), '%AUDIT1_ID%', '%%E', 'Top electricians eastern suburbs Sydney?', 1, false, null, 'Some well-known electricians in Sydney include Spark Master and Eastern Suburbs Electrical.', '[]', '0.0040', 72, 'gpt-4o-mini', NOW()) ON CONFLICT DO NOTHING" >nul 2>&1
)

REM ── Step 5: Sprint 6 Action Items ─────────────────────────────
echo [5/5] Seeding Sprint 6 action items (8 recommendations)...
%PSQL% -U postgres -h localhost -d visibleau -f "db\seed\sprint6-test-data.sql" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT COUNT(*) FROM action_items WHERE organization_id='%ORG_ID%'"`) do set ACTION_COUNT=%%I
for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT COUNT(*) FROM recommendation_research"`) do set RESEARCH_COUNT=%%I
for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT COUNT(*) FROM vertical_pack_prompts"`) do set PROMPT_COUNT=%%I

echo.
echo ============================================================
echo   ALL TEST DATA SEEDED SUCCESSFULLY
echo.
echo   Organization: VisibleAU Dev (agency tier)
echo   User:         Sri Komman (sri@visibleau.local)
echo   Brand:        Bondi Plumbing (tradies, Bondi + Sydney CBD)
echo.
echo   Sprint 1-4:
echo     Audit #1:   score 68.5/100 (8 citations)
echo     Dashboard:  1 brand, 1 audit, US$2.45 spend
echo.
echo   Sprint 5:
echo     Vertical packs: 3 (Tradies/Allied Health/SaaS)
echo     Pack prompts:   %PROMPT_COUNT% total
echo.
echo   Sprint 6:
echo     Action items:      %ACTION_COUNT% recommendations
echo       4x Frequency     (Wikipedia, AU dirs, Reddit, Press)
echo       2x Accuracy      (Stale content, Expert quotes)
echo       1x Context       (FAQ schema)
echo       1x Position      (Comparison article)
echo     Confidence:        3 Confirmed, 4 Likely, 1 Hypothesis
echo     Research citations: %RESEARCH_COUNT% rows
echo.
echo   Login:
echo     Email:    sri@visibleau.local
echo     Password: password123
echo.
echo   Pages to test:
echo     /dashboard        - KPI cards, recent audits
echo     /brands           - Brand cards with scores
echo     /brands/wizard    - Data-driven pack selection
echo     /verticals        - 3 active + 2 coming + 3 soon
echo     /action-center    - 8 recs grouped by dimension
echo     /action-center/id - Detail with evidence + actions
echo     /settings/billing - Tier display
echo ============================================================
echo.
pause
