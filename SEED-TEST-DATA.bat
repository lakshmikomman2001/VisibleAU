@echo off
REM ============================================================
REM  VisibleAU — Seed Test Data
REM  Creates org, user, brand, and a sample audit with citations
REM  Run this ONCE before testing the dashboard
REM ============================================================
setlocal EnableDelayedExpansion

cd /d "%~dp0"
set PGPASSWORD=password
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"

echo [SEED] Seeding organization...
%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO organizations (id, clerk_org_id, name, tier, region, metadata, created_at, updated_at) VALUES (gen_random_uuid(), 'YOlMjajxQPtDqAMdblehOhhFDXGDiuBi', 'VisibleAU Dev', 'agency', 'au', '{}', NOW(), NOW()) ON CONFLICT (clerk_org_id) DO UPDATE SET tier='agency', name='VisibleAU Dev'" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM organizations WHERE clerk_org_id='YOlMjajxQPtDqAMdblehOhhFDXGDiuBi'"`) do set ORG_ID=%%I
echo [SEED] Org ID: %ORG_ID%

echo [SEED] Seeding user...
%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO users (id, clerk_user_id, organization_id, email, name, role, created_at, updated_at) VALUES (gen_random_uuid(), '4Fc7RPQaytFN7dqHAwOsjG8XrbteBYpY', '%ORG_ID%', 'sri@visibleau.local', 'Sri Komman', 'owner', NOW(), NOW()) ON CONFLICT (clerk_user_id) DO UPDATE SET email='sri@visibleau.local', name='Sri Komman', organization_id='%ORG_ID%'" >nul 2>&1

echo [SEED] Seeding brand: Bondi Plumbing...
%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO brands (id, organization_id, name, domain, vertical, region, competitors, primary_regions, created_at, updated_at) VALUES (gen_random_uuid(), '%ORG_ID%', 'Bondi Plumbing', 'bondiplumbing.com.au', 'tradies', 'au', ARRAY['Eastern Plumbing','Sydney Pipe Pros'], ARRAY['NSW:Bondi','NSW:Sydney CBD'], NOW(), NOW()) ON CONFLICT DO NOTHING" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM brands WHERE organization_id='%ORG_ID%' AND name='Bondi Plumbing' LIMIT 1"`) do set BRAND_ID=%%I
echo [SEED] Brand ID: %BRAND_ID%

echo [SEED] Seeding completed audit with scores...
%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO audits (id, brand_id, organization_id, audit_number, status, triggered_by, engines, prompts_count, runs_per_prompt, total_calls, score_composite, score_frequency, score_position, score_sentiment, score_sentiment_numeric, score_context, score_context_numeric, score_accuracy, score_confidence_low, score_confidence_high, confidence_intervals, total_cost_usd, metadata, started_at, completed_at, created_at) VALUES (gen_random_uuid(), '%BRAND_ID%', '%ORG_ID%', 1, 'complete', 'manual', ARRAY['chatgpt','claude','gemini','perplexity'], 10, 5, 200, '68.50', '70.00', '85.00', 'positive', '75.00', 'listed', '50.00', '60.00', '62.30', '74.70', '{\"frequency\":{\"lower\":55.2,\"upper\":82.1},\"position\":{\"lower\":70.5,\"upper\":95.0},\"sentiment\":{\"lower\":60.0,\"upper\":88.0},\"context\":{\"lower\":35.0,\"upper\":65.0},\"accuracy\":{\"lower\":45.0,\"upper\":75.0},\"composite\":{\"lower\":62.3,\"upper\":74.7}}', '2.4500', '{}', NOW() - INTERVAL '10 minutes', NOW(), NOW()) ON CONFLICT DO NOTHING" >nul 2>&1

for /f "usebackq tokens=*" %%I in (`%PSQL% -U postgres -h localhost -d visibleau -t -A -c "SELECT id FROM audits WHERE organization_id='%ORG_ID%' AND audit_number=1 LIMIT 1"`) do set AUDIT_ID=%%I
echo [SEED] Audit ID: %AUDIT_ID%

echo [SEED] Seeding sample citations (10 rows)...
for %%E in (chatgpt claude gemini perplexity) do (
  %PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO citations (id, audit_id, engine, prompt, run_number, brand_mentioned, position, sentiment_label, context_label, response_snippet, cited_sources, llm_cost_usd, llm_tokens_used, llm_model, created_at) VALUES (gen_random_uuid(), '%AUDIT_ID%', '%%E', 'Best plumber in Sydney?', 1, true, 2, 'positive', 'recommended', 'Bondi Plumbing is highly recommended for emergency plumbing services in Sydney eastern suburbs. They offer 24/7 service and have excellent reviews on Google and hipages.', '[{\"domain\":\"bondiplumbing.com.au\",\"url\":\"https://bondiplumbing.com.au\"},{\"domain\":\"hipages.com.au\",\"url\":\"https://hipages.com.au\"}]', '0.0050', 85, 'gpt-4o-mini', NOW()) ON CONFLICT DO NOTHING" >nul 2>&1
  %PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO citations (id, audit_id, engine, prompt, run_number, brand_mentioned, position, response_snippet, cited_sources, llm_cost_usd, llm_tokens_used, llm_model, created_at) VALUES (gen_random_uuid(), '%AUDIT_ID%', '%%E', 'Top electricians eastern suburbs Sydney?', 1, false, null, 'Some well-known electricians in Sydney include Spark Master and Eastern Suburbs Electrical. Check local directories for verified tradespeople.', '[]', '0.0040', 72, 'gpt-4o-mini', NOW()) ON CONFLICT DO NOTHING" >nul 2>&1
)

%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO citations (id, audit_id, engine, prompt, run_number, brand_mentioned, position, sentiment_label, context_label, response_snippet, cited_sources, llm_cost_usd, llm_tokens_used, llm_model, created_at) VALUES (gen_random_uuid(), '%AUDIT_ID%', 'chatgpt', 'Is Bondi Plumbing reputable?', 2, true, 1, 'positive', 'recommended', 'Yes, Bondi Plumbing is a well-regarded plumbing service in Sydney. They are known for reliability, fair pricing, and professional service. Visit bondiplumbing.com.au for more.', '[{\"domain\":\"bondiplumbing.com.au\",\"url\":\"https://bondiplumbing.com.au\"}]', '0.0045', 78, 'gpt-4o-mini', NOW()) ON CONFLICT DO NOTHING" >nul 2>&1
%PSQL% -U postgres -h localhost -d visibleau -c "INSERT INTO citations (id, audit_id, engine, prompt, run_number, brand_mentioned, position, sentiment_label, context_label, response_snippet, cited_sources, llm_cost_usd, llm_tokens_used, llm_model, created_at) VALUES (gen_random_uuid(), '%AUDIT_ID%', 'claude', 'Can you recommend a plumber near Bondi?', 2, true, 1, 'positive', 'listed', 'For plumbing near Bondi, I recommend Bondi Plumbing — they have strong local reviews. Also consider Eastern Plumbing Co for competitive pricing.', '[{\"domain\":\"bondiplumbing.com.au\",\"url\":\"https://bondiplumbing.com.au\"}]', '0.0035', 65, 'claude-3-5-haiku-20241022', NOW()) ON CONFLICT DO NOTHING" >nul 2>&1

echo.
echo ============================================
echo   SEED COMPLETE
echo.
echo   Organization: VisibleAU Dev (agency tier)
echo   User:         Sri Komman
echo   Brand:        Bondi Plumbing (tradies)
echo   Audit:        #1 - complete, score 68.5/100
echo   Citations:    10 rows across 4 engines
echo.
echo   Login:
echo     Email:    sri@visibleau.local
echo     Password: password123
echo.
echo   Dashboard will show:
echo     - 1 brand tracked
echo     - 1 audit this month
echo     - US$2.45 LLM spend
echo     - Recent audit: Bondi Plumbing, score 68.5
echo ============================================
echo.
pause
