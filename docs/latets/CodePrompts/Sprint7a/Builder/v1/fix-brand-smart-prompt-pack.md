# VisibleAU — Fix Prompt: Smart Brand-Specific Prompt Pack
# Version: 1.0 | Post-Sprint 7
# Purpose: Replace generic vertical prompts with AI-classified, brand-specific prompt packs
# Safety: Zero breaking changes — fully additive, backward-compatible with all existing features

---

## CONTEXT & PROBLEM

The current audit system pulls prompts from a static vertical pack (tradies / saas /
allied_health) chosen by the user at brand creation. This causes two problems:

1. WRONG QUERIES: A brand like Canva (design SaaS) gets time-tracking and HR prompts
   because "SaaS" is too coarse — it covers Canva, Xero, Slack, and Salesforce equally.
   Result: Canva scores 34.4 when the true score should be 85+.

2. GENERIC PROMPTS: All brands in the same vertical get the same prompts. A plumber in
   Bondi and a plumber in Brisbane get identical queries — no brand-specific signals.

The fix: classify each brand using a one-time LLM call (Claude Haiku, ~$0.001 per brand),
store the classification, and generate brand-specific prompt packs from it. Every brand
gets prompts matched to its exact business type, buyer persona, and competitor set.

---

## PHASE 1: INVESTIGATE (read before writing any code)

### Step 1.1 — Find the existing prompt generation path

Search for where prompts are currently generated before an audit runs:

```bash
grep -rn "prompt\|vertical\|expand" lib/ --include="*.ts" -l
grep -rn "promptPack\|prompt_pack\|buildPrompts\|getPrompts" lib/ --include="*.ts"
grep -rn "vertical" db/schema --include="*.ts" | head -20
```

Find and READ the full content of:
- `lib/verticals/expand-prompt.ts` (prompt expansion — named in CLAUDE.md)
- `lib/audit/runner.ts` (how prompts are passed to the audit engine)
- The Drizzle schema file that defines the `brands` table
- Any existing vertical pack data files

Document what you find:
- What is the current shape of prompts passed to runner.ts?
- Does brands table already have a `vertical` column? What type?
- Does brands table have any `classification` or `prompt_pack` column? (expect: NO)
- How many prompts currently run per audit? Where is that count set?

### Step 1.2 — Confirm the LLM service is available

```bash
grep -rn "getLLMService\|LLMService\|model-selector" lib/ --include="*.ts" | head -10
cat lib/llm/model-selector.ts
```

Confirm Claude Haiku model string (e.g. `claude-haiku-4-5`) is present in model-selector.
Do NOT hardcode the model string anywhere — use model-selector throughout.

### Step 1.3 — Check brands table migration history

```bash
ls db/migrations/ | sort | tail -10
grep -rn "brands" db/migrations/ | grep -i "vertical\|classif\|prompt" | head -10
```

Note the latest migration timestamp — your new migration must come AFTER it.

### Step 1.4 — Check Inngest job that triggers prompt generation

```bash
grep -rn "prompt\|vertical\|expand" inngest/functions/ --include="*.ts" | head -20
```

Find where in the audit trigger flow prompts are fetched or generated.
This is the integration point — you will call `buildPromptPack()` here.

---

## PHASE 2: DATABASE MIGRATION (additive only — zero breaking changes)

### Step 2.1 — Create the migration

Create file: `db/migrations/<timestamp>_add_brand_classification.sql`

Use the NEXT timestamp after the latest existing migration.

```sql
-- Migration: add brand classification and cached prompt pack
-- Safe: all columns nullable, no existing columns modified

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS classification        JSONB,
  ADD COLUMN IF NOT EXISTS classification_status TEXT
    CHECK (classification_status IN ('pending','processing','complete','failed'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS classification_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prompt_pack           JSONB,
  ADD COLUMN IF NOT EXISTS prompt_pack_version   INTEGER DEFAULT 1;

-- Index for finding unclassified brands (background job)
CREATE INDEX IF NOT EXISTS idx_brands_classification_status
  ON brands (classification_status)
  WHERE classification_status IN ('pending', 'failed');

COMMENT ON COLUMN brands.classification IS
  'AI-derived brand classification: category, buyerType, intentSignals, competitors, auRelevance, confidence';
COMMENT ON COLUMN brands.prompt_pack IS
  'Cached prompt pack generated from classification. Array of prompt strings.';
```

### Step 2.2 — Update the Drizzle schema

Find the brands table definition in `db/schema/` and ADD (do not modify existing fields):

```typescript
// ADD to existing brands table definition — do not modify any existing columns
classification:        jsonb('classification').$type<BrandClassification | null>().default(null),
classificationStatus:  text('classification_status',
                         { enum: ['pending','processing','complete','failed'] }
                       ).default('pending').notNull(),
classificationAt:      timestamp('classification_at', { withTimezone: true }),
promptPack:            jsonb('prompt_pack').$type<string[] | null>().default(null),
promptPackVersion:     integer('prompt_pack_version').default(1),
```

Add the `BrandClassification` type to the schema file or to `lib/types/brand.ts`:

```typescript
export interface BrandClassification {
  category: string;           // e.g. 'design_tools', 'accounting_software', 'trades_plumbing'
  buyerType: 'smb' | 'enterprise' | 'consumer' | 'freelancer' | 'agency' | 'mixed';
  intentSignals: string[];    // 3–5 phrases: how users search for this type of product
  competitors: string[];      // 3–5 direct competitors by name
  auRelevance: 'au_founded' | 'au_strong' | 'au_present' | 'au_limited';
  confidence: number;         // 0–1; below 0.6 = use category-level fallback prompts
}
```

### Step 2.3 — Run the migration

```bash
# Apply migration
npx drizzle-kit push
# OR if using migration files:
npx drizzle-kit migrate

# Verify columns added
psql $DATABASE_URL -c "\d brands" | grep -E "classification|prompt_pack"
```

---

## PHASE 3: CLASSIFICATION SERVICE

### Step 3.1 — Create `lib/brands/classify-brand.ts`

```typescript
/**
 * lib/brands/classify-brand.ts
 *
 * One-time AI classification of a brand by domain and name.
 * Uses Claude Haiku via the central model selector — never hardcodes a model.
 * Costs ~$0.001 per brand. Runs once on brand creation; re-runs only on manual refresh.
 *
 * SAFETY: this module has NO side effects — it returns a classification object.
 * The caller (classifyAndStoreBrand) handles DB writes.
 * Never call real LLM in tests — respect LLM_MODE=mock (returns fixture classification).
 */

import { getLLMService } from '@/lib/llm/model-selector';
import type { BrandClassification } from '@/lib/types/brand';

// Mock fixture — returned when LLM_MODE=mock (covers all test/dev runs)
const MOCK_CLASSIFICATION: BrandClassification = {
  category: 'saas_design_tools',
  buyerType: 'smb',
  intentSignals: ['graphic design software', 'social media templates', 'presentation maker'],
  competitors: ['Adobe Express', 'Figma', 'Microsoft Designer'],
  auRelevance: 'au_founded',
  confidence: 0.95,
};

const CLASSIFICATION_PROMPT = (brandName: string, domain: string, signals: string) => `
You are classifying an Australian business for AI visibility auditing.
Respond with VALID JSON ONLY — no markdown, no explanation, no preamble.

Brand name: ${brandName}
Domain: ${domain}
Domain signals: ${signals}

Classify this brand and return exactly this JSON structure:
{
  "category": "<specific category — use underscore_case, be specific e.g. 'trades_plumbing' not just 'trades', 'accounting_software' not 'saas', 'allied_health_dental' not 'health'>",
  "buyerType": "<one of: smb | enterprise | consumer | freelancer | agency | mixed>",
  "intentSignals": ["<phrase 1>", "<phrase 2>", "<phrase 3>"],
  "competitors": ["<competitor 1>", "<competitor 2>", "<competitor 3>"],
  "auRelevance": "<one of: au_founded | au_strong | au_present | au_limited>",
  "confidence": <number 0.0–1.0>
}

Rules:
- category must be specific enough to select the right prompts (e.g. 'trades_plumbing', 'saas_design_tools', 'allied_health_dental', 'ecommerce_fashion')
- intentSignals = the phrases real users type when looking for this TYPE of product/service
- competitors = direct competitors the brand competes with (by name, not category)
- auRelevance: au_founded = HQ in Australia; au_strong = major AU presence; au_present = available in AU; au_limited = minimal AU presence
- If you cannot determine with confidence > 0.5, set confidence to your actual estimate
`;

export async function classifyBrand(
  brandName: string,
  domain: string,
  userVertical?: string,
): Promise<BrandClassification> {
  const llm = getLLMService();

  // Respect LLM_MODE=mock — never make real API calls in tests
  if (process.env.LLM_MODE === 'mock') {
    return { ...MOCK_CLASSIFICATION };
  }

  // Light domain signals from the domain string itself (no scraping needed)
  const domainSignals = [
    `domain: ${domain}`,
    userVertical ? `user-selected vertical: ${userVertical}` : '',
  ].filter(Boolean).join(', ');

  const raw = await llm.complete({
    prompt: CLASSIFICATION_PROMPT(brandName, domain, domainSignals),
    maxTokens: 400,
    temperature: 0.1, // low temperature for consistent classification
  });

  // Parse and validate — fall back to low-confidence generic if malformed
  try {
    const parsed = JSON.parse(raw.trim()) as BrandClassification;

    // Validate required fields
    if (!parsed.category || !parsed.buyerType || !Array.isArray(parsed.intentSignals)) {
      throw new Error('Missing required fields');
    }

    // Clamp confidence
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));

    return parsed;
  } catch {
    // Graceful fallback — never block brand creation
    console.error('[classifyBrand] JSON parse failed, using fallback', { brandName, domain });
    return {
      category: userVertical ?? 'general',
      buyerType: 'smb',
      intentSignals: [`${brandName} Australia`, `best ${userVertical ?? 'business'} Australia`],
      competitors: [],
      auRelevance: 'au_present',
      confidence: 0.3,
    };
  }
}
```

### Step 3.2 — Create `lib/brands/classify-and-store.ts`

```typescript
/**
 * lib/brands/classify-and-store.ts
 *
 * Orchestrates classify → store → build prompt pack for a single brand.
 * Called from: brand creation API route (after brand row inserted).
 * Also called from: the background Inngest job for existing brands (backfill).
 *
 * IDEMPOTENT: safe to call multiple times — uses classification_status guard.
 */

import { db } from '@/db';
import { brands } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { classifyBrand } from './classify-brand';
import { buildPromptPack } from '@/lib/prompts/build-prompt-pack';

export async function classifyAndStoreBrand(brandId: string): Promise<void> {
  // Fetch brand — confirm it exists and needs classification
  const [brand] = await db
    .select({
      id: brands.id,
      name: brands.name,
      domain: brands.domain,
      vertical: brands.vertical,
      classificationStatus: brands.classificationStatus,
    })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (!brand) {
    console.error('[classifyAndStoreBrand] Brand not found', { brandId });
    return;
  }

  // Idempotency guard — skip if already complete
  if (brand.classificationStatus === 'complete') {
    return;
  }

  // Mark as processing
  await db
    .update(brands)
    .set({ classificationStatus: 'processing' })
    .where(eq(brands.id, brandId));

  try {
    // 1. Classify
    const classification = await classifyBrand(
      brand.name,
      brand.domain,
      brand.vertical ?? undefined,
    );

    // 2. Build prompt pack from classification
    const promptPack = buildPromptPack(classification, brand.name, brand.domain);

    // 3. Store both
    await db
      .update(brands)
      .set({
        classification,
        classificationStatus: 'complete',
        classificationAt: new Date(),
        promptPack,
        promptPackVersion: 1,
      })
      .where(eq(brands.id, brandId));

  } catch (err) {
    console.error('[classifyAndStoreBrand] Failed', { brandId, err });
    await db
      .update(brands)
      .set({ classificationStatus: 'failed' })
      .where(eq(brands.id, brandId));
    // Do NOT rethrow — brand creation must succeed even if classification fails
    // Audit runner will fall back to vertical-pack prompts if prompt_pack is null
  }
}
```

---

## PHASE 4: PROMPT TEMPLATE LIBRARY

### Step 4.1 — Create `lib/prompts/templates.ts`

This is the heart of the fix. Each category has prompts matched to how real Australians
search for that type of product or service. Prompts are MARKET queries, not brand queries —
the brand either appears in the AI answer or it does not.

```typescript
/**
 * lib/prompts/templates.ts
 *
 * AU-specific prompt templates per business category × buyer type.
 * These are MARKET QUERIES — they ask what the market uses, not about the brand.
 * The brand either appears in AI answers or it doesn't — that IS the audit.
 *
 * Naming convention: CATEGORY_TEMPLATES[category][buyerType] = string[]
 * Categories use underscore_case matching BrandClassification.category.
 * Unknown categories fall back to the 'general' entry.
 *
 * To add a new category: add an entry following the same pattern.
 * Do NOT hardcode brand names in templates — use {brandName} placeholder only
 * in the enriched prompts (Phase 5), never here.
 */

export type BuyerType = 'smb' | 'enterprise' | 'consumer' | 'freelancer' | 'agency' | 'mixed';

export type PromptTemplateMap = Partial<Record<BuyerType, string[]>>;

export const CATEGORY_TEMPLATES: Record<string, PromptTemplateMap> = {

  // ── DESIGN & CREATIVE TOOLS ──────────────────────────────────────────────
  saas_design_tools: {
    smb: [
      'Best graphic design tools for Australian small businesses?',
      'What do Australian marketing teams use to create social media content?',
      'Affordable design software for Australian startups and SMEs?',
      'Best online design tools for non-designers in Australia?',
      'What tools do Australian businesses use for presentations and pitch decks?',
      'Best design collaboration tools for remote Australian teams?',
      'What software do Australian content creators use for branded graphics?',
      'Easy-to-use design platforms popular with Australian SMEs?',
    ],
    agency: [
      'Best design tools used by Australian creative and marketing agencies?',
      'What design platforms do Australian agencies use for client work?',
      'Design collaboration software for Australian agency teams?',
      'Brand template tools popular with Australian marketing agencies?',
    ],
    enterprise: [
      'Enterprise design platforms used by large Australian companies?',
      'Design asset management tools for Australian enterprise marketing teams?',
    ],
    freelancer: [
      'Best design tools for Australian freelancers and sole traders?',
      'Affordable graphic design software for Australian independent creatives?',
    ],
  },

  // ── ACCOUNTING & FINANCE ─────────────────────────────────────────────────
  accounting_software: {
    smb: [
      'Best accounting software for Australian small businesses?',
      'Most popular bookkeeping software among Australian SMEs?',
      'Accounting tools that handle GST and BAS for Australian businesses?',
      'Best cloud accounting software for Australian sole traders?',
      'What accounting software integrates with Australian banks?',
      'Cheapest accounting software for small Australian businesses?',
      'Best Xero alternatives for Australian small businesses?',
      'Accounting software with payroll for Australian businesses?',
    ],
    freelancer: [
      'Best invoicing software for Australian freelancers?',
      'Accounting tools for Australian sole traders that handle GST?',
      'Simplest bookkeeping app for Australian self-employed workers?',
    ],
    enterprise: [
      'Enterprise accounting platforms used by large Australian companies?',
      'ERP financial modules popular with Australian enterprise firms?',
    ],
  },

  // ── CRM & SALES ──────────────────────────────────────────────────────────
  crm_software: {
    smb: [
      'Best CRM software for Australian small businesses?',
      'Most popular CRM tools used by Australian SMEs?',
      'CRM that integrates with Xero for Australian companies?',
      'Affordable CRM for small Australian sales teams?',
      'Best CRM for Australian service-based businesses?',
      'What CRM do Australian real estate agencies use?',
    ],
    enterprise: [
      'Enterprise CRM platforms used by large Australian companies?',
      'Best Salesforce alternatives for Australian enterprise?',
      'CRM with Australian data residency options?',
    ],
    agency: [
      'Best CRM for Australian marketing and sales agencies?',
      'CRM tools popular with Australian B2B agencies?',
    ],
  },

  // ── PROJECT MANAGEMENT ───────────────────────────────────────────────────
  project_management: {
    smb: [
      'Best project management tools for Australian small businesses?',
      'Most popular project management software among Australian SMEs?',
      'Simple task management tools for small Australian teams?',
      'Project management apps popular with Australian startups?',
      'Best Asana alternatives for Australian businesses?',
    ],
    enterprise: [
      'Enterprise project management platforms used in Australia?',
      'Project portfolio management tools for large Australian organisations?',
    ],
    agency: [
      'Best project management tools for Australian creative agencies?',
      'Client project tracking software used by Australian agencies?',
    ],
  },

  // ── HR & PAYROLL ─────────────────────────────────────────────────────────
  hr_software: {
    smb: [
      'Best HR software for small Australian businesses?',
      'Most popular payroll software among Australian SMEs?',
      'HR tools that handle Australian awards and Fair Work compliance?',
      'Best employee onboarding software for Australian businesses?',
      'Affordable HR platform for Australian businesses under 50 staff?',
      'HR software with Single Touch Payroll for Australian companies?',
    ],
    enterprise: [
      'Enterprise HR platforms used by large Australian companies?',
      'HRIS systems popular with Australian enterprise organisations?',
    ],
  },

  // ── HELPDESK & CUSTOMER SUPPORT ──────────────────────────────────────────
  helpdesk_software: {
    smb: [
      'Best helpdesk software for Australian customer support teams?',
      'Most popular customer support tools among Australian SMEs?',
      'Affordable ticketing system for small Australian businesses?',
      'Best live chat software for Australian e-commerce businesses?',
      'Customer support software with Australian data hosting?',
    ],
    enterprise: [
      'Enterprise helpdesk platforms used by large Australian companies?',
      'Omnichannel customer support tools popular in the Australian market?',
    ],
  },

  // ── MARKETING AUTOMATION ─────────────────────────────────────────────────
  marketing_automation: {
    smb: [
      'Best email marketing tools for Australian small businesses?',
      'Most popular marketing automation platforms among Australian SMEs?',
      'Affordable email campaign software for Australian businesses?',
      'Best Mailchimp alternatives for Australian businesses?',
      'Marketing automation tools that support AUD pricing?',
    ],
    agency: [
      'Top marketing automation tools used by Australian agencies?',
      'Best marketing platforms for Australian digital agencies?',
      'Marketing automation tools with white-label options for Australian agencies?',
    ],
    enterprise: [
      'Enterprise marketing automation used by large Australian companies?',
      'Marketing cloud platforms popular with Australian enterprise brands?',
    ],
  },

  // ── E-COMMERCE PLATFORMS ─────────────────────────────────────────────────
  ecommerce_platform: {
    smb: [
      'Best e-commerce platforms for Australian small businesses?',
      'Most popular online store builders among Australian retailers?',
      'E-commerce platforms that support AUD and Australian shipping?',
      'Best Shopify alternatives for Australian businesses?',
      'Cheapest way to start an online store in Australia?',
      'E-commerce platforms popular with Australian fashion and apparel brands?',
    ],
    enterprise: [
      'Enterprise e-commerce platforms used by large Australian retailers?',
      'Headless commerce solutions popular in the Australian market?',
    ],
  },

  // ── TRADES (PLUMBING, ELECTRICAL, BUILDING) ──────────────────────────────
  trades_plumbing: {
    smb: [
      'Best plumbers in {region} for emergency repairs?',
      'Reliable plumber {region} available on weekends?',
      'Licensed plumber for hot water system replacement {region}?',
      'Who are the top-rated plumbers in {region}?',
      'Best plumbing companies for commercial fitouts in {region}?',
    ],
  },
  trades_electrical: {
    smb: [
      'Best electricians in {region} for home renovations?',
      'Licensed electrician for switchboard upgrade {region}?',
      'Who are the most reliable electricians in {region}?',
      'Electricians that handle solar panel installation in {region}?',
      'Emergency electrician {region} available 24/7?',
    ],
  },
  trades_building: {
    smb: [
      'Best builders in {region} for home extensions?',
      'Top-rated construction companies in {region}?',
      'Licensed builder for knockdown rebuild {region}?',
      'Best residential builders in {region} for new homes?',
    ],
  },
  trades_general: {
    smb: [
      'Best trade services in {region} for home maintenance?',
      'Top-rated tradies in {region} reviewed on hipages?',
      'Affordable and reliable tradies near {region}?',
      'Most recommended trade businesses in {region}?',
    ],
  },

  // ── ALLIED HEALTH ────────────────────────────────────────────────────────
  allied_health_dental: {
    smb: [
      'Best dentists in {region} accepting new patients?',
      'Affordable dental clinics in {region} with payment plans?',
      'Top-rated dental practices in {region} on Google?',
      'Best cosmetic dentists in {region} for teeth whitening?',
      'Family dentist {region} bulk billing or low-gap?',
    ],
  },
  allied_health_physio: {
    smb: [
      'Best physiotherapists in {region} for sports injuries?',
      'Top-rated physio clinics in {region}?',
      'Physiotherapy for lower back pain {region}?',
      'Best physiotherapy clinics near {region} with HICAPS?',
    ],
  },
  allied_health_mental: {
    smb: [
      'Best psychologists in {region} accepting new clients?',
      'Affordable mental health support in {region}?',
      'Counsellors and therapists in {region} with Medicare rebates?',
      'Best anxiety and depression treatment {region}?',
    ],
  },
  allied_health_general: {
    smb: [
      'Best health clinics in {region} accepting new patients?',
      'Top-rated allied health providers in {region}?',
      'Allied health services in {region} with private health rebates?',
    ],
  },

  // ── LEGAL SERVICES ───────────────────────────────────────────────────────
  legal_services: {
    smb: [
      'Best commercial lawyers in {region} for small businesses?',
      'Top-rated law firms in {region} for employment law?',
      'Affordable business lawyers in {region}?',
      'Best conveyancing solicitors in {region}?',
      'Law firms in {region} specialising in contract disputes?',
    ],
  },
  legal_tech: {
    smb: [
      'Best document management software for Australian law firms?',
      'Practice management software popular with Australian law firms?',
      'Legal tech tools used by small Australian law practices?',
      'Document automation software for Australian solicitors?',
    ],
  },

  // ── FINTECH & PAYMENTS ───────────────────────────────────────────────────
  fintech_payments: {
    smb: [
      'Best payment processing solutions for Australian small businesses?',
      'Most popular EFTPOS and payment terminals in Australia?',
      'Online payment gateways used by Australian e-commerce stores?',
      'Best buy-now-pay-later options for Australian businesses?',
      'Cheapest payment processing fees for Australian SMEs?',
    ],
    enterprise: [
      'Enterprise payment platforms used by large Australian companies?',
      'Best payment orchestration tools for Australian enterprise?',
    ],
  },

  // ── PROPERTY & REAL ESTATE ───────────────────────────────────────────────
  real_estate_agency: {
    smb: [
      'Best real estate agents in {region} for selling property?',
      'Top-rated property management companies in {region}?',
      'Most trusted real estate agencies in {region}?',
      'Best buyer agents in {region} for first home buyers?',
      'Real estate agents in {region} with highest auction clearance rates?',
    ],
  },

  // ── EDUCATION & TRAINING ─────────────────────────────────────────────────
  education_online: {
    consumer: [
      'Best online learning platforms in Australia?',
      'Most popular online course providers for Australians?',
      'Affordable online professional development in Australia?',
      'Best platforms to learn coding online in Australia?',
      'Online certifications recognised by Australian employers?',
    ],
  },

  // ── HOSPITALITY & FOOD ───────────────────────────────────────────────────
  hospitality_restaurant: {
    consumer: [
      'Best restaurants in {region} for a special occasion?',
      'Top-rated cafes in {region} on Google Maps?',
      'Best BYO restaurants in {region}?',
      'Most popular brunch spots in {region}?',
    ],
  },

  // ── GENERAL FALLBACK ─────────────────────────────────────────────────────
  general: {
    smb: [
      'Best {category} solutions for Australian small businesses?',
      'Most popular {category} services in Australia?',
      'Top-rated {category} providers in Australia?',
      'What do Australian businesses use for {category}?',
      'Recommended {category} tools or services in Australia?',
    ],
    consumer: [
      'Best {category} options in Australia?',
      'Most trusted {category} providers in Australia?',
      'Top-reviewed {category} services in Australia?',
    ],
  },
};

/**
 * Get templates for a category, with graceful fallback chain:
 * exact match → parent category (e.g. 'trades_plumbing' → 'trades_general') → 'general'
 */
export function getTemplatesForCategory(
  category: string,
  buyerType: BuyerType,
): string[] {
  // Exact match
  const exact = CATEGORY_TEMPLATES[category]?.[buyerType]
    ?? CATEGORY_TEMPLATES[category]?.smb  // buyer type fallback within category
    ?? CATEGORY_TEMPLATES[category]?.consumer;

  if (exact && exact.length > 0) return exact;

  // Parent category fallback (e.g. 'trades_plumbing' → 'trades_general')
  const parentKey = category.includes('_')
    ? category.split('_')[0] + '_general'
    : null;

  if (parentKey) {
    const parent = CATEGORY_TEMPLATES[parentKey]?.[buyerType]
      ?? CATEGORY_TEMPLATES[parentKey]?.smb;
    if (parent && parent.length > 0) return parent;
  }

  // Final fallback — general templates
  return CATEGORY_TEMPLATES.general[buyerType]
    ?? CATEGORY_TEMPLATES.general.smb
    ?? [];
}
```

### Step 4.2 — Create `lib/prompts/build-prompt-pack.ts`

```typescript
/**
 * lib/prompts/build-prompt-pack.ts
 *
 * Builds a brand-specific, audit-ready prompt array from a BrandClassification.
 *
 * Mix strategy:
 *   60% — category templates (what the MARKET uses — brand-agnostic)
 *   40% — brand-specific enriched prompts (direct brand + competitor signals)
 *
 * Region tokens ({region}) are resolved from the brand's primary region.
 * Generic tokens ({category}, {brandName}) are resolved from classification.
 *
 * Returns: string[] ready to pass to the audit runner.
 * Never returns an empty array — always falls back to general prompts.
 */

import type { BrandClassification } from '@/lib/types/brand';
import { getTemplatesForCategory, type BuyerType } from './templates';

const DEFAULT_PROMPT_COUNT = 10;

export function buildPromptPack(
  classification: BrandClassification,
  brandName: string,
  domain: string,
  region: string = 'Australia',
  promptCount: number = DEFAULT_PROMPT_COUNT,
): string[] {

  const categoryTemplates = getTemplatesForCategory(
    classification.category,
    classification.buyerType as BuyerType,
  );

  // Resolve region token in templates (e.g. "Best plumbers in {region}?")
  const resolved = categoryTemplates.map(p =>
    p.replace(/{region}/g, region)
     .replace(/{category}/g, classification.category.replace(/_/g, ' '))
     .replace(/{brandName}/g, brandName)
  );

  // Brand-specific enriched prompts (40% of pack)
  const enriched = buildEnrichedPrompts(classification, brandName, domain, region);

  // Mix: 60% category, 40% enriched
  const categoryCount = Math.ceil(promptCount * 0.6);
  const enrichedCount = Math.floor(promptCount * 0.4);

  const mixed = [
    ...shuffle(resolved).slice(0, categoryCount),
    ...shuffle(enriched).slice(0, enrichedCount),
  ];

  // Deduplicate and pad if needed
  const unique = [...new Set(mixed)];

  if (unique.length < promptCount) {
    // Pad with more category templates if we don't have enough
    const extras = resolved.filter(p => !unique.includes(p));
    unique.push(...extras.slice(0, promptCount - unique.length));
  }

  return unique.slice(0, promptCount);
}

function buildEnrichedPrompts(
  classification: BrandClassification,
  brandName: string,
  domain: string,
  region: string,
): string[] {
  const prompts: string[] = [];

  // Competitor comparison prompts (high signal — brand either wins or loses)
  for (const competitor of classification.competitors.slice(0, 2)) {
    prompts.push(
      `${brandName} vs ${competitor} — which is better for Australian businesses?`,
    );
  }

  // Alternative prompts (measures brand awareness via alternatives queries)
  prompts.push(`What are the best alternatives to ${brandName} in Australia?`);

  // Intent signal prompts (derived from how users search for this TYPE of product)
  for (const signal of classification.intentSignals.slice(0, 2)) {
    prompts.push(`Best ${signal} for Australian businesses?`);
  }

  // Direct brand awareness prompts
  prompts.push(`Is ${brandName} popular in Australia?`);

  if (classification.auRelevance === 'au_founded') {
    prompts.push(`What Australian tech companies are leading in their space in 2025?`);
  }

  return prompts;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

---

## PHASE 5: INTEGRATION — WIRE INTO AUDIT RUNNER

### Step 5.1 — Update brand creation API to trigger classification

Find the brand creation API route (likely `app/api/brands/route.ts` or similar).
AFTER the brand row is successfully inserted, add the classification call:

```typescript
// AFTER: await db.insert(brands).values({ ...brandData }) succeeds
// ADD (non-blocking — do not await, brand creation must not wait on LLM):

import { classifyAndStoreBrand } from '@/lib/brands/classify-and-store';

// Fire and forget — classification runs in background
// Brand creation response is not delayed
classifyAndStoreBrand(newBrand.id).catch(err => {
  console.error('[brand-create] Classification failed (non-fatal)', err);
});
```

### Step 5.2 — Update the audit runner to use prompt_pack

Find `lib/audit/runner.ts` and the section where prompts are loaded.

BEFORE (current behaviour — reads from vertical pack):
```typescript
// Whatever the current prompt loading looks like
const prompts = await getPromptsForVertical(brand.vertical, promptCount);
```

AFTER (new behaviour — use stored prompt_pack, fall back gracefully):
```typescript
import { buildPromptPack } from '@/lib/prompts/build-prompt-pack';

async function getAuditPrompts(brand: Brand, promptCount: number): Promise<string[]> {
  // 1. Use stored prompt pack if available and fresh
  if (brand.promptPack && Array.isArray(brand.promptPack) && brand.promptPack.length > 0) {
    // Pad or truncate to requested count
    if (brand.promptPack.length >= promptCount) {
      return brand.promptPack.slice(0, promptCount);
    }
    // Stored pack shorter than needed — pad with category templates
    if (brand.classification) {
      return buildPromptPack(
        brand.classification,
        brand.name,
        brand.domain,
        brand.region ?? 'Australia',
        promptCount,
      );
    }
    return brand.promptPack; // use what we have
  }

  // 2. Classification exists but no pack cached yet — build on the fly
  if (brand.classification) {
    return buildPromptPack(
      brand.classification,
      brand.name,
      brand.domain,
      brand.region ?? 'Australia',
      promptCount,
    );
  }

  // 3. FALLBACK — classification not yet complete, use existing vertical pack
  // This preserves 100% backward compatibility for brands created before this fix
  console.warn('[getAuditPrompts] No classification yet for brand', brand.id, '— using vertical fallback');
  return getPromptsForVertical(brand.vertical, promptCount); // existing function, unchanged
}
```

**CRITICAL:** The fallback in step 3 means existing brands without classification still
work exactly as before. Zero breaking changes.

### Step 5.3 — Create Inngest backfill job for existing brands

Create `inngest/functions/classify-existing-brands.ts`:

```typescript
/**
 * inngest/functions/classify-existing-brands.ts
 *
 * One-time backfill: classify all existing brands that have no classification yet.
 * Triggered manually via the Inngest dashboard, or via a one-time API call.
 * Rate-limited to avoid hammering the LLM API — 1 brand per 2 seconds.
 *
 * SAFE: classifyAndStoreBrand is idempotent — skips brands already classified.
 */

import { inngest } from '@/inngest/client';
import { db } from '@/db';
import { brands } from '@/db/schema';
import { isNull, eq } from 'drizzle-orm';
import { classifyAndStoreBrand } from '@/lib/brands/classify-and-store';

export const classifyExistingBrands = inngest.createFunction(
  { id: 'classify-existing-brands', name: 'Classify Existing Brands (Backfill)' },
  { event: 'brand/classify-all' },
  async ({ step, logger }) => {
    // Fetch all unclassified brands
    const unclassified = await step.run('fetch-unclassified', async () => {
      return db
        .select({ id: brands.id, name: brands.name })
        .from(brands)
        .where(isNull(brands.classification));
    });

    logger.info(`[classify-existing-brands] Found ${unclassified.length} brands to classify`);

    // Classify sequentially with delay to avoid rate limits
    for (const brand of unclassified) {
      await step.run(`classify-${brand.id}`, async () => {
        await classifyAndStoreBrand(brand.id);
        logger.info(`[classify-existing-brands] Classified: ${brand.name}`);
      });

      // 2-second delay between classifications
      await step.sleep(`delay-${brand.id}`, '2s');
    }

    return { classified: unclassified.length };
  },
);
```

Add `classifyExistingBrands` to the serve() array in `app/api/inngest/route.ts`.

---

## PHASE 6: VERIFY — DEFINITION OF DONE

Run ALL of the following checks. Do not mark complete until every item passes.

### Check 1 — Migration applied
```bash
psql $DATABASE_URL -c "\d brands" | grep -E "classification|prompt_pack|classification_status"
# Must show: classification (jsonb), classification_status (text), prompt_pack (jsonb)
```

### Check 2 — Existing brands unaffected
```bash
# All existing brands should still have classification_status = 'pending'
# (not null, not errored) and their audits should still run via the fallback path
psql $DATABASE_URL -c "SELECT id, name, classification_status FROM brands LIMIT 5;"
# classification column should be null for existing brands (not yet classified)
# classification_status should be 'pending'
```

### Check 3 — Create a test brand and verify classification fires
Create a new brand via the UI: name="Test Canva", domain="canva.com", vertical="saas"

Then check:
```bash
psql $DATABASE_URL -c "
  SELECT name, classification_status, classification->>'category' as category,
         jsonb_array_length(prompt_pack) as prompt_count
  FROM brands WHERE name = 'Test Canva';
"
# Expected:
# name: Test Canva
# classification_status: complete
# category: saas_design_tools (or similar)
# prompt_count: 10
```

### Check 4 — Prompt pack is brand-appropriate
```bash
psql $DATABASE_URL -c "
  SELECT jsonb_array_elements_text(prompt_pack) as prompt
  FROM brands WHERE name = 'Test Canva';
"
# Prompts MUST be design/creative related — NOT accounting, HR, or helpdesk queries
# Expect: 'Best graphic design tools for Australian small businesses?' and similar
```

### Check 5 — Run a real audit on the test brand
Run an audit on "Test Canva" with LLM_MODE=real (if keys available) or mock.
Check that:
- Audit completes without errors
- If real: duration > 30s (real LLM calls, not mock)
- If mock: completes normally
- No 500 errors in the console
- The Responses tab populates

### Check 6 — Existing brand audit still works
Run an audit on an EXISTING brand (one created before this fix, e.g. Bondi Plumbing).
Verify:
- Audit completes without errors
- Prompts are still tradies-type (fallback path used correctly)
- No change in behaviour for existing brands

### Check 7 — Canva re-audit gives design prompts
Create brand "Canva" / domain "canva.com" / vertical "saas".
Wait for classification to complete (check classification_status = 'complete').
Run audit. Verify prompts in the Responses tab are design/creative queries — NOT
the generic B2B SaaS queries from the original failed run.

---

## PHASE 7: SAFETY NET — ROLLBACK PLAN

This fix is additive. If anything goes wrong:

1. **To revert the runner change:** replace `getAuditPrompts()` with the original
   vertical-pack call. The new columns on brands table are nullable and harmless.

2. **To revert the migration:** the new columns are all nullable with defaults —
   they can be dropped safely without affecting any existing data:
   ```sql
   ALTER TABLE brands
     DROP COLUMN IF EXISTS classification,
     DROP COLUMN IF EXISTS classification_status,
     DROP COLUMN IF EXISTS classification_at,
     DROP COLUMN IF EXISTS prompt_pack,
     DROP COLUMN IF EXISTS prompt_pack_version;
   ```

3. **The backfill job is optional** — existing brands work via the fallback path
   indefinitely. Only run the backfill when you're confident the fix is stable.

---

## SUMMARY OF FILES CREATED / MODIFIED

### New files (create from scratch):
- `db/migrations/<timestamp>_add_brand_classification.sql`
- `lib/brands/classify-brand.ts`
- `lib/brands/classify-and-store.ts`
- `lib/prompts/templates.ts`
- `lib/prompts/build-prompt-pack.ts`
- `inngest/functions/classify-existing-brands.ts`

### Modified files (additive changes only):
- `db/schema/<brands-schema-file>.ts` — add 5 nullable columns to brands table
- `app/api/brands/route.ts` (or equivalent) — fire classifyAndStoreBrand after insert
- `lib/audit/runner.ts` — replace prompt loading with getAuditPrompts() (with fallback)
- `app/api/inngest/route.ts` — add classifyExistingBrands to serve() array

### Zero changes to:
- Any existing schema columns
- Any existing audit scoring logic (scorer.ts, citation-detector.ts)
- Any existing vertical pack files
- Any existing UI components
- Any existing API response shapes
- Existing brands or their audit history

