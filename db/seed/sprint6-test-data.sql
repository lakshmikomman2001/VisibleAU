-- Sprint 6 test data: audit with LOW scores + 8 action items
-- Run: psql -U postgres -h localhost -d visibleau -f db/seed/sprint6-test-data.sql

DO $$
DECLARE
  v_org_id UUID;
  v_brand_id UUID;
  v_audit_id UUID;
BEGIN
  -- Get existing org
  SELECT id INTO v_org_id FROM organizations WHERE clerk_org_id = 'YOlMjajxQPtDqAMdblehOhhFDXGDiuBi';
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Org not found. Run SEED-TEST-DATA.bat first.';
  END IF;

  -- Get existing brand
  SELECT id INTO v_brand_id FROM brands WHERE organization_id = v_org_id AND name = 'Bondi Plumbing' LIMIT 1;
  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'Brand not found. Run SEED-TEST-DATA.bat first.';
  END IF;

  -- Insert audit with LOW scores (triggers all 11 action types)
  INSERT INTO audits (id, brand_id, organization_id, audit_number, status, triggered_by, engines, prompts_count, runs_per_prompt, total_calls, score_composite, score_frequency, score_position, score_sentiment, score_sentiment_numeric, score_context, score_context_numeric, score_accuracy, score_confidence_low, score_confidence_high, confidence_intervals, total_cost_usd, metadata, started_at, completed_at, created_at)
  VALUES (gen_random_uuid(), v_brand_id, v_org_id, 99, 'complete', 'manual',
    ARRAY['chatgpt','claude','gemini','perplexity'], 10, 5, 200,
    '25.00', '20.00', '30.00', 'mixed', '60.00', 'commodified', '25.00', '35.00', '18.50', '31.50',
    '{"frequency":{"lower":12,"upper":28},"position":{"lower":22,"upper":38},"accuracy":{"lower":25,"upper":45}}'::jsonb,
    '2.4500', '{}'::jsonb, NOW() - INTERVAL '10 minutes', NOW(), NOW())
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_audit_id FROM audits WHERE organization_id = v_org_id AND audit_number = 99 LIMIT 1;
  RAISE NOTICE 'Audit ID: %', v_audit_id;

  -- Clean existing action items for this audit
  DELETE FROM action_items WHERE audit_id = v_audit_id;

  -- FREQUENCY: Wikipedia (confirmed, high)
  INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, evidence_refs, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, v_brand_id, v_audit_id, 'wikipedia-article', 'frequency',
    'Add a Wikipedia entry for Bondi Plumbing',
    'Draft a neutral, citation-backed Wikipedia article about your business. Wikipedia pages appear in 47.9% of ChatGPT top-10 citations.',
    'confirmed', 'high',
    '[{"source":"Princeton GEO Study (2024)","url":"https://arxiv.org/abs/2404.11973","summary":"Wikipedia = 47.9% of ChatGPT top-10 citation share."}]'::jsonb,
    'open', NOW(), NOW());

  -- FREQUENCY: AU directories (confirmed, high)
  INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, evidence_refs, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, v_brand_id, v_audit_id, 'au-local-citations', 'frequency',
    'Your AU local directory listings are incomplete',
    'Submit your business to hipages, Yellow Pages AU, ServiceSeeking, and Word of Mouth with consistent NAP data.',
    'confirmed', 'high',
    '[{"source":"Local SEO AU analysis","url":"","summary":"NAP consistency heavily weights LLM local responses."}]'::jsonb,
    'open', NOW(), NOW());

  -- FREQUENCY: Reddit (likely, medium)
  INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, evidence_refs, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, v_brand_id, v_audit_id, 'reddit-absence', 'frequency',
    'Get mentioned in relevant Reddit threads',
    'Identify 3 active subreddits (r/sydney, r/AusPlumbing, r/homeimprovement) and contribute helpful answers. Reddit = 24% of Perplexity citations.',
    'likely', 'medium',
    '[{"source":"Tinuiti Q1 2026","url":"https://tinuiti.com/research/","summary":"Reddit = 24% of all Perplexity citations."}]'::jsonb,
    'open', NOW(), NOW());

  -- FREQUENCY: Press mentions (likely, medium)
  INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, evidence_refs, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, v_brand_id, v_audit_id, 'press-mentions', 'frequency',
    'Pitch your business story to local AU media',
    'Contact one AU trade publication or local outlet with a newsworthy angle (e.g. milestone, community sponsorship).',
    'likely', 'medium',
    '[{"source":"TEAM LEWIS PR","url":"https://www.teamlewis.com/insights/machine-relations","summary":"Earned media creates corroboration redundancy that survives citation drift."}]'::jsonb,
    'open', NOW(), NOW());

  -- ACCURACY: Stale content (confirmed, high)
  INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, evidence_refs, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, v_brand_id, v_audit_id, 'stale-content', 'accuracy',
    'Update pages older than 12 months',
    'Add a "Last updated" date and refresh pricing, availability, and contact details. Updated content averages 5.0 AI citations vs 3.9 for older content.',
    'confirmed', 'high',
    '[{"source":"SE Ranking (Dec 2025)","url":"https://seranking.com/blog/ai-overviews-study/","summary":"Updated content averages 5.0 AI citations vs 3.9 for content > 2 years old."}]'::jsonb,
    'open', NOW(), NOW());

  -- ACCURACY: Expert quotes (likely, medium)
  INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, evidence_refs, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, v_brand_id, v_audit_id, 'expert-quotes', 'accuracy',
    'Add attributed expert quotes to your about page',
    'Add 2-3 quotes from industry bodies (e.g. Master Plumbers AU) with attribution and date.',
    'likely', 'medium',
    '[{"source":"Princeton GEO (2024)","url":"https://arxiv.org/abs/2404.11973","summary":"Expert quotes boost AI visibility by 41% across 10,000 queries."}]'::jsonb,
    'open', NOW(), NOW());

  -- CONTEXT: FAQ content (likely, medium)
  INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, evidence_refs, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, v_brand_id, v_audit_id, 'faq-content', 'context',
    'Add FAQ schema to your main service page',
    'Add a FAQPage schema block answering "What suburbs do you service?" and "What is your call-out fee?". Place FAQs in the main body — schema markup alone has near-zero impact.',
    'likely', 'medium',
    '[{"source":"SE Ranking AI Mode (Dec 2025)","url":"https://seranking.com/blog/ai-overviews-study/","summary":"FAQ blocks in main content average 4.9 AI citations vs 4.4 without."}]'::jsonb,
    'open', NOW(), NOW());

  -- POSITION: Comparison article (hypothesis, medium)
  INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, evidence_refs, status, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, v_brand_id, v_audit_id, 'comparison-article', 'position',
    'Write a service comparison guide',
    'Publish a 600-word guide comparing your service type with alternatives, citing pros/cons.',
    'hypothesis', 'medium',
    '[{"source":"HubSpot AEO (2026)","url":"https://blog.hubspot.com/marketing/ai-search-optimization","summary":"Comparison content appears more often in LLM responses for high-intent queries."}]'::jsonb,
    'open', NOW(), NOW());

  RAISE NOTICE 'Seeded 8 action items for audit %', v_audit_id;
END $$;
