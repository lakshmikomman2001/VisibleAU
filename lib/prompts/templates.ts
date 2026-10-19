import type { Audience } from "@/lib/types/brand";

export type BuyerType = "smb" | "enterprise" | "consumer" | "freelancer" | "agency" | "mixed";

export type PromptTemplateMap = Partial<Record<BuyerType, string[]>>;

/**
 * Vunnara Build 1, Part C: the closed set of categories prompts can
 * actually be selected for -- every key CATEGORY_TEMPLATES defines,
 * kept in sync by tests/unit/prompts/category.test.ts (which asserts
 * this list exactly matches Object.keys(CATEGORY_TEMPLATES)). The
 * classifier LLM was previously free to invent any underscore_case
 * string ("trades_general_services" for Omega) -- resolveCategory maps
 * whatever it returns onto one of these, closing the gap that silently
 * fell through to the generic business-tool "general" templates.
 */
export const CATEGORY_KEYS = [
  "saas_design_tools",
  "accounting_software",
  "crm_software",
  "project_management",
  "hr_software",
  "helpdesk_software",
  "marketing_automation",
  "ecommerce_platform",
  "trades_plumbing",
  "trades_electrical",
  "trades_building",
  "trades_general",
  "allied_health_dental",
  "allied_health_physio",
  "allied_health_mental",
  "allied_health_general",
  "legal_services",
  "legal_tech",
  "fintech_payments",
  "real_estate_agency",
  "education_online",
  "hospitality_restaurant",
  "general",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** Human label for prompt text and UI -- never the raw underscore_case
 * slug ("trades general services services", Omega's actual {category}
 * substitution before this fix). */
export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  saas_design_tools: "Design software",
  accounting_software: "Accounting software",
  crm_software: "CRM software",
  project_management: "Project management software",
  hr_software: "HR software",
  helpdesk_software: "Helpdesk software",
  marketing_automation: "Marketing automation",
  ecommerce_platform: "E-commerce platform",
  trades_plumbing: "Plumbing",
  trades_electrical: "Electrical",
  trades_building: "Building & construction",
  trades_general: "General trades",
  allied_health_dental: "Dental",
  allied_health_physio: "Physiotherapy",
  allied_health_mental: "Mental health",
  allied_health_general: "Allied health",
  legal_services: "Legal services",
  legal_tech: "Legal technology",
  fintech_payments: "Fintech & payments",
  real_estate_agency: "Real estate",
  education_online: "Online education",
  hospitality_restaurant: "Hospitality & restaurants",
  general: "General business",
};

/**
 * Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 3: a natural phrase
 * for "who/what you'd search for" per category, used in the one
 * branded "good choice" template -- "Is {brand} a good choice for
 * {phrase} in {region}?" ("...for a plumber in...", never the raw
 * CATEGORY_LABELS value mid-sentence, "...for Plumbing in...").
 * categoryServicePhrase() below is the single place this is read from
 * -- never built ad hoc at a call site.
 */
export const CATEGORY_SERVICE_PHRASE: Record<CategoryKey, string> = {
  saas_design_tools: "design software",
  accounting_software: "accounting software",
  crm_software: "a CRM",
  project_management: "project management software",
  hr_software: "HR software",
  helpdesk_software: "helpdesk software",
  marketing_automation: "marketing automation",
  ecommerce_platform: "an e-commerce platform",
  trades_plumbing: "a plumber",
  trades_electrical: "an electrician",
  trades_building: "a builder",
  trades_general: "a tradie",
  allied_health_dental: "a dentist",
  allied_health_physio: "a physiotherapist",
  allied_health_mental: "a psychologist",
  allied_health_general: "an allied health provider",
  legal_services: "a lawyer",
  legal_tech: "legal tech",
  fintech_payments: "payment processing",
  real_estate_agency: "a real estate agent",
  education_online: "online learning",
  hospitality_restaurant: "a restaurant",
  general: "a provider",
};

/**
 * Near-miss slugs the classifier is known to invent, mapped onto a real
 * CATEGORY_KEYS entry. Keys are pre-normalised (lowercase, spaces/
 * hyphens collapsed to underscores) by resolveCategory before lookup.
 */
export const CATEGORY_ALIASES: Record<string, CategoryKey> = {
  trades_general_services: "trades_general",
  home_services: "trades_general",
  handyman: "trades_general",
  plumbing: "trades_plumbing",
  plumber: "trades_plumbing",
  plumbers: "trades_plumbing",
  electrician: "trades_electrical",
  electricians: "trades_electrical",
  electrical_services: "trades_electrical",
  building: "trades_building",
  building_construction: "trades_building",
  construction: "trades_building",
  builder: "trades_building",
  dental: "allied_health_dental",
  dentist: "allied_health_dental",
  dentistry: "allied_health_dental",
  physiotherapy: "allied_health_physio",
  physio: "allied_health_physio",
  physiotherapist: "allied_health_physio",
  mental_health: "allied_health_mental",
  psychology: "allied_health_mental",
  counselling: "allied_health_mental",
  counseling: "allied_health_mental",
  allied_health: "allied_health_general",
  healthcare: "allied_health_general",
  law_firm: "legal_services",
  legal: "legal_services",
  lawyer: "legal_services",
  solicitor: "legal_services",
  conveyancing: "legal_services",
  real_estate: "real_estate_agency",
  realestate: "real_estate_agency",
  property: "real_estate_agency",
  property_management: "real_estate_agency",
  restaurant: "hospitality_restaurant",
  cafe: "hospitality_restaurant",
  hospitality: "hospitality_restaurant",
  food_service: "hospitality_restaurant",
  education: "education_online",
  online_education: "education_online",
  tutoring: "education_online",
  e_learning: "education_online",
  fintech: "fintech_payments",
  payments: "fintech_payments",
  banking: "fintech_payments",
  crm: "crm_software",
  hr: "hr_software",
  human_resources: "hr_software",
  helpdesk: "helpdesk_software",
  customer_support: "helpdesk_software",
  marketing: "marketing_automation",
  ecommerce: "ecommerce_platform",
  e_commerce: "ecommerce_platform",
  retail: "ecommerce_platform",
  design: "saas_design_tools",
  design_software: "saas_design_tools",
  graphic_design: "saas_design_tools",
  accounting: "accounting_software",
  bookkeeping: "accounting_software",
  project_management_software: "project_management",
};

function normalizeCategorySlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Maps whatever the classifier returned onto a real CATEGORY_KEYS
 * entry: exact match, then the alias table, then the same
 * "{parent}_general" fallback getTemplatesForCategory already used,
 * then "general". Never throws, never returns an invented slug --
 * every caller that selects templates or builds prompt text from a
 * category should go through this (or getTemplatesForCategory, which
 * already does) rather than trusting classification.category directly.
 */
export function resolveCategory(raw: string): CategoryKey {
  const normalized = normalizeCategorySlug(raw);
  if ((CATEGORY_KEYS as readonly string[]).includes(normalized)) {
    return normalized as CategoryKey;
  }
  const aliased = CATEGORY_ALIASES[normalized];
  if (aliased) return aliased;

  const parts = normalized.split("_");
  if (parts.length > 1) {
    const parentGeneral = `${parts.slice(0, -1).join("_")}_general`;
    if ((CATEGORY_KEYS as readonly string[]).includes(parentGeneral)) {
      return parentGeneral as CategoryKey;
    }
  }
  return "general";
}

/** Human label for a (possibly unresolved/legacy) stored category. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[resolveCategory(category)];
}

/** Natural "who/what you'd search for" phrase for a (possibly
 * unresolved/legacy) stored category -- see CATEGORY_SERVICE_PHRASE's
 * own doc comment. */
export function categoryServicePhrase(category: string): string {
  return CATEGORY_SERVICE_PHRASE[resolveCategory(category)];
}

/**
 * Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 1: which of the
 * brand's CONFIRMED categories a free-text classifier signal
 * ("emergency plumber Norwest") is actually about -- checked word by
 * word against CATEGORY_ALIASES/CATEGORY_KEYS directly (never through
 * resolveCategory's own "_general"/"general" fallback chain, which
 * would make every non-matching word look like a false-positive
 * match on a generic category). Returns null, never a guessed
 * category, when no word matches one of the candidates -- the caller
 * falls back to the first confirmed category, same "weighted to the
 * first" rule the round-robin allocation itself uses.
 */
export function matchCategoryInText(text: string, candidates: readonly string[]): string | null {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const word of words) {
    const resolved = (CATEGORY_KEYS as readonly string[]).includes(word)
      ? word
      : CATEGORY_ALIASES[word];
    if (resolved && candidates.includes(resolved)) return resolved;
  }
  return null;
}

export const CATEGORY_TEMPLATES: Record<string, PromptTemplateMap> = {
  saas_design_tools: {
    smb: [
      "Best graphic design tools for Australian small businesses?",
      "What do Australian marketing teams use to create social media content?",
      "Affordable design software for Australian startups and SMEs?",
      "Best online design tools for non-designers in Australia?",
      "What tools do Australian businesses use for presentations and pitch decks?",
      "Best design collaboration tools for remote Australian teams?",
      "What software do Australian content creators use for branded graphics?",
      "Easy-to-use design platforms popular with Australian SMEs?",
    ],
    agency: [
      "Best design tools used by Australian creative and marketing agencies?",
      "What design platforms do Australian agencies use for client work?",
      "Design collaboration software for Australian agency teams?",
      "Brand template tools popular with Australian marketing agencies?",
    ],
    enterprise: [
      "Enterprise design platforms used by large Australian companies?",
      "Design asset management tools for Australian enterprise marketing teams?",
    ],
    freelancer: [
      "Best design tools for Australian freelancers and sole traders?",
      "Affordable graphic design software for Australian independent creatives?",
    ],
  },

  accounting_software: {
    smb: [
      "Best accounting software for Australian small businesses?",
      "Most popular bookkeeping software among Australian SMEs?",
      "Accounting tools that handle GST and BAS for Australian businesses?",
      "Best cloud accounting software for Australian sole traders?",
      "What accounting software integrates with Australian banks?",
      "Cheapest accounting software for small Australian businesses?",
      "Best Xero alternatives for Australian small businesses?",
      "Accounting software with payroll for Australian businesses?",
    ],
    freelancer: [
      "Best invoicing software for Australian freelancers?",
      "Accounting tools for Australian sole traders that handle GST?",
      "Simplest bookkeeping app for Australian self-employed workers?",
    ],
    enterprise: [
      "Enterprise accounting platforms used by large Australian companies?",
      "ERP financial modules popular with Australian enterprise firms?",
    ],
  },

  crm_software: {
    smb: [
      "Best CRM software for Australian small businesses?",
      "Most popular CRM tools used by Australian SMEs?",
      "CRM that integrates with Xero for Australian companies?",
      "Affordable CRM for small Australian sales teams?",
      "Best CRM for Australian service-based businesses?",
      "What CRM do Australian real estate agencies use?",
    ],
    enterprise: [
      "Enterprise CRM platforms used by large Australian companies?",
      "Best Salesforce alternatives for Australian enterprise?",
      "CRM with Australian data residency options?",
    ],
    agency: [
      "Best CRM for Australian marketing and sales agencies?",
      "CRM tools popular with Australian B2B agencies?",
    ],
  },

  project_management: {
    smb: [
      "Best project management tools for Australian small businesses?",
      "Most popular project management software among Australian SMEs?",
      "Simple task management tools for small Australian teams?",
      "Project management apps popular with Australian startups?",
      "Best Asana alternatives for Australian businesses?",
    ],
    enterprise: [
      "Enterprise project management platforms used in Australia?",
      "Project portfolio management tools for large Australian organisations?",
    ],
    agency: [
      "Best project management tools for Australian creative agencies?",
      "Client project tracking software used by Australian agencies?",
    ],
  },

  hr_software: {
    smb: [
      "Best HR software for small Australian businesses?",
      "Most popular payroll software among Australian SMEs?",
      "HR tools that handle Australian awards and Fair Work compliance?",
      "Best employee onboarding software for Australian businesses?",
      "Affordable HR platform for Australian businesses under 50 staff?",
      "HR software with Single Touch Payroll for Australian companies?",
    ],
    enterprise: [
      "Enterprise HR platforms used by large Australian companies?",
      "HRIS systems popular with Australian enterprise organisations?",
    ],
  },

  helpdesk_software: {
    smb: [
      "Best helpdesk software for Australian customer support teams?",
      "Most popular customer support tools among Australian SMEs?",
      "Affordable ticketing system for small Australian businesses?",
      "Best live chat software for Australian e-commerce businesses?",
      "Customer support software with Australian data hosting?",
    ],
    enterprise: [
      "Enterprise helpdesk platforms used by large Australian companies?",
      "Omnichannel customer support tools popular in the Australian market?",
    ],
  },

  marketing_automation: {
    smb: [
      "Best email marketing tools for Australian small businesses?",
      "Most popular marketing automation platforms among Australian SMEs?",
      "Affordable email campaign software for Australian businesses?",
      "Best Mailchimp alternatives for Australian businesses?",
      "Marketing automation tools that support AUD pricing?",
    ],
    agency: [
      "Top marketing automation tools used by Australian agencies?",
      "Best marketing platforms for Australian digital agencies?",
      "Marketing automation tools with white-label options for Australian agencies?",
    ],
    enterprise: [
      "Enterprise marketing automation used by large Australian companies?",
      "Marketing cloud platforms popular with Australian enterprise brands?",
    ],
  },

  ecommerce_platform: {
    smb: [
      "Best e-commerce platforms for Australian small businesses?",
      "Most popular online store builders among Australian retailers?",
      "E-commerce platforms that support AUD and Australian shipping?",
      "Best Shopify alternatives for Australian businesses?",
      "Cheapest way to start an online store in Australia?",
      "E-commerce platforms popular with Australian fashion and apparel brands?",
    ],
    enterprise: [
      "Enterprise e-commerce platforms used by large Australian retailers?",
      "Headless commerce solutions popular in the Australian market?",
    ],
  },

  trades_plumbing: {
    smb: [
      "Best plumbers in {region} for emergency repairs?",
      "Reliable plumber in {region} available on weekends?",
      "Licensed plumber for hot water system replacement in {region}?",
      "Who are the top-rated plumbers in {region}?",
      "Best plumbing companies for commercial fitouts in {region}?",
      "Plumber in {region} for a blocked drain, who do locals recommend?",
      "Same-day plumber in {region} for a burst pipe?",
      "Best plumber in {region} for a leaking tap or toilet?",
      // Build 1 addendum, item 11: "gas hot water systems" named a
      // sub-specialty not every plumber offers (the same failure as
      // asking a plumber about painters) -- replaced with a generic
      // customer-intent phrasing every plumbing business can answer.
      "Plumber in {region} -- who do locals trust for general repairs?",
      "Plumber in {region} with good reviews for bathroom renovations?",
    ],
  },
  trades_electrical: {
    smb: [
      "Best electricians in {region} for home renovations?",
      "Licensed electrician for switchboard upgrade in {region}?",
      "Who are the most reliable electricians in {region}?",
      "Electricians that handle solar panel installation in {region}?",
      "Emergency electrician in {region} available 24/7?",
      "Electrician in {region} for a tripped switchboard or blown fuse?",
      "Who does ceiling fan and light fitting installs in {region}?",
      "Best electrician in {region} for a new power point or circuit?",
      "Electrician in {region} who can quote an EV charger install?",
      "Reliable sparkie in {region} for an electrical safety check?",
    ],
  },
  trades_building: {
    smb: [
      "Best builders in {region} for home extensions?",
      "Top-rated construction companies in {region}?",
      "Licensed builder for knockdown rebuild in {region}?",
      "Best residential builders in {region} for new homes?",
      "Builder in {region} for a kitchen or bathroom renovation?",
      "Who are the best builders in {region} for a granny flat or extension?",
      "Builder in {region} with good reviews for a deck or pergola?",
      "Licensed builder in {region} for a small renovation job?",
      "Best builders in {region} for a second-storey addition?",
      "Who do locals recommend for a full home renovation in {region}?",
    ],
  },
  trades_general: {
    smb: [
      "Best trade services in {region} for home maintenance?",
      // Vunnara hotfix 2 (19 Oct, post-609e323): named "hipages" (a
      // third-party directory, not the customer's need) -- steers the
      // AI toward that platform and makes the question about it,
      // never a brand being audited for AI visibility. Replaced with
      // generic customer-intent phrasing every trade business can
      // answer, same pattern as item 11's earlier sub-specialty fixes.
      "Top-rated tradies in {region} with the best reviews?",
      "Affordable and reliable tradies near {region}?",
      "Most recommended trade businesses in {region}?",
      "Handyman in {region} for small jobs around the house?",
      "Who do locals in {region} recommend for general home repairs?",
      // Vunnara hotfix 3 (19 Oct, post-9c2c73a): flat-pack furniture
      // assembly is an Airtasker task, not a trade -- replaced with a
      // real trade job every general trades business can answer.
      "Best tradie in {region} for deck, fence or pergola repairs?",
      "Reliable handyman in {region} for gutter cleaning and repairs?",
      "Trade services in {region} for a pre-sale property fix-up?",
      "Who's good for odd jobs and minor repairs in {region}?",
    ],
  },

  allied_health_dental: {
    smb: [
      "Best dentists in {region} accepting new patients?",
      "Affordable dental clinics in {region} with payment plans?",
      "Top-rated dental practices in {region} on Google?",
      "Best cosmetic dentists in {region} for teeth whitening?",
      "Family dentist in {region} bulk billing or low-gap?",
      "Dentist in {region} for a child-friendly check-up?",
      "Emergency dentist in {region} for a cracked or broken tooth?",
      "Best dentist in {region} for Invisalign or braces?",
      "Dentist in {region} who accepts HICAPS for health fund claims?",
      "Gentle dentist in {region} for nervous patients?",
    ],
  },
  allied_health_physio: {
    smb: [
      "Best physiotherapists in {region} for sports injuries?",
      "Top-rated physio clinics in {region}?",
      "Physiotherapy for lower back pain in {region}?",
      "Best physiotherapy clinics near {region} with HICAPS?",
      "Physio in {region} for a shoulder or knee injury?",
      "Sports physiotherapist in {region} for a running injury?",
      "Best physio in {region} for post-surgery rehab?",
      "Physiotherapist in {region} who treats chronic back pain?",
      "Physio in {region} with same-week appointments available?",
      "Who do locals recommend for pelvic floor physio in {region}?",
    ],
  },
  allied_health_mental: {
    smb: [
      "Best psychologists in {region} accepting new clients?",
      "Affordable mental health support in {region}?",
      "Counsellors and therapists in {region} with Medicare rebates?",
      "Best anxiety and depression treatment in {region}?",
      "Psychologist in {region} taking new clients for anxiety?",
      "Best therapist in {region} for couples counselling?",
      "Psychologist in {region} with telehealth appointments available?",
      "Who do locals recommend for a psychologist with a Mental Health Care Plan in {region}?",
      "Counsellor in {region} experienced with grief and loss?",
      "Best psychologist in {region} for teenagers and young adults?",
    ],
  },
  allied_health_general: {
    smb: [
      "Best health clinics in {region} accepting new patients?",
      "Top-rated allied health providers in {region}?",
      "Allied health services in {region} with private health rebates?",
      // Build 1 addendum, item 11: naming specific disciplines
      // (dietitian/podiatrist/OT/speech pathologist/exercise
      // physiologist) mixed unrelated specialties into one broad
      // category -- a clinic offering one doesn't offer them all, the
      // same failure as asking a plumber about painters. Replaced with
      // generic customer-intent phrasing every allied-health provider
      // in this category can answer.
      "Allied health provider in {region} taking new patients?",
      "Best allied health clinic in {region} for a referral?",
      "Allied health specialist in {region} covered by my health fund?",
      "Who do locals recommend for allied health care in {region}?",
      "Allied health clinic in {region} with same-week appointments?",
      "Allied health clinic in {region} with evening or weekend appointments?",
      "Who do locals recommend for a multidisciplinary health clinic in {region}?",
    ],
  },

  legal_services: {
    smb: [
      "Best commercial lawyers in {region} for small businesses?",
      "Top-rated law firms in {region} for employment law?",
      "Affordable business lawyers in {region}?",
      "Best conveyancing solicitors in {region}?",
      "Law firms in {region} specialising in contract disputes?",
      // Build 1 addendum, item 11: "family lawyer"/"wills and
      // estates"/"traffic or criminal" named sub-specialties a given
      // firm may not practise -- a family-law firm doesn't do criminal
      // defence either. Replaced with generic customer-intent phrasing
      // every law firm in this category can answer.
      "Lawyer in {region} -- who do locals recommend?",
      "Best law firm in {region} with good reviews?",
      "Lawyer in {region} who offers fixed-fee services?",
      "Who are the most experienced lawyers in {region}?",
      "Lawyer in {region} offering a free first consultation?",
    ],
  },
  legal_tech: {
    smb: [
      "Best document management software for Australian law firms?",
      "Practice management software popular with Australian law firms?",
      "Legal tech tools used by small Australian law practices?",
      "Document automation software for Australian solicitors?",
    ],
  },

  fintech_payments: {
    smb: [
      "Best payment processing solutions for Australian small businesses?",
      "Most popular EFTPOS and payment terminals in Australia?",
      "Online payment gateways used by Australian e-commerce stores?",
      "Best buy-now-pay-later options for Australian businesses?",
      "Cheapest payment processing fees for Australian SMEs?",
    ],
    enterprise: [
      "Enterprise payment platforms used by large Australian companies?",
      "Best payment orchestration tools for Australian enterprise?",
    ],
  },

  real_estate_agency: {
    smb: [
      "Best real estate agents in {region} for selling property?",
      "Top-rated property management companies in {region}?",
      "Most trusted real estate agencies in {region}?",
      "Best buyer agents in {region} for first home buyers?",
      "Real estate agents in {region} with highest auction clearance rates?",
      "Best real estate agent in {region} for renting out an investment property?",
      "Who do locals recommend to sell a house in {region}?",
      "Real estate agency in {region} with the best local market knowledge?",
      "Best agent in {region} for a quick, no-fuss sale?",
      "Property manager in {region} with good reviews from landlords?",
    ],
  },

  education_online: {
    consumer: [
      "Best online learning platforms in Australia?",
      "Most popular online course providers for Australians?",
      "Affordable online professional development in Australia?",
      "Best platforms to learn coding online in Australia?",
      "Online certifications recognised by Australian employers?",
      "Best online bootcamps for a career change in Australia?",
      "Where can Australians learn digital marketing online?",
      "Best online platforms for learning a new language in Australia?",
      "Most affordable online MBA or business courses for Australians?",
      "Best online courses with recognised certificates for Australian professionals?",
    ],
  },

  hospitality_restaurant: {
    consumer: [
      "Best restaurants in {region} for a special occasion?",
      "Top-rated cafes in {region} on Google Maps?",
      "Best BYO restaurants in {region}?",
      "Most popular brunch spots in {region}?",
      "Best family-friendly restaurants in {region}?",
      // Build 1 addendum, item 11: "good coffee"/"Italian restaurants"
      // named sub-specialties/cuisines not every venue in this
      // category serves -- replaced with generic customer-intent
      // phrasing every restaurant or cafe can answer.
      "Best restaurants in {region} for a group booking?",
      "Best restaurants in {region} with vegetarian or vegan options?",
      "Good spot for a date night in {region}?",
      "Highly rated restaurants in {region} on Google?",
      "Where locals go for a casual dinner in {region}?",
    ],
  },

  general: {
    smb: [
      "Best {category} solutions for Australian small businesses?",
      "Most popular {category} services in Australia?",
      "Top-rated {category} providers in Australia?",
      "What do Australian businesses use for {category}?",
      "Recommended {category} tools or services in Australia?",
    ],
    consumer: [
      "Best {category} options in Australia?",
      "Most trusted {category} providers in Australia?",
      "Top-reviewed {category} services in Australia?",
    ],
  },
};

/**
 * Vunnara Build 1, Part E.6: general.smb's business-owner phrasing
 * ("...for Australian businesses") must never reach a households-
 * audience brand -- a local plumber that falls through to "general"
 * (low classifier confidence, or an unrecognised category) would
 * otherwise get the generic SMB bucket's wording, which the audience
 * had nothing to do with. For a households audience, try the
 * consumer bucket FIRST, before the buyerType/smb fallbacks; every
 * other audience keeps the exact pre-existing lookup order so already-
 * classified businesses/both brands see no behaviour change.
 */
function bucketOrderForAudience(buyerType: BuyerType, audience?: Audience): BuyerType[] {
  if (audience === "households") return ["consumer", buyerType, "smb"];
  return [buyerType, "smb", "consumer"];
}

export function getTemplatesForCategory(
  rawCategory: string,
  buyerType: BuyerType,
  audience?: Audience,
): string[] {
  // Vunnara Build 1, Part C: resolve onto a real CATEGORY_KEYS entry
  // first -- legacy rows and any future classifier drift are corrected
  // at read time, never trusted as a raw slug.
  const category = resolveCategory(rawCategory);
  const buckets = CATEGORY_TEMPLATES[category];
  for (const bucket of bucketOrderForAudience(buyerType, audience)) {
    const list = buckets?.[bucket];
    if (list && list.length > 0) return list;
  }

  const parts = category.split("_");
  const parentKey = parts.length > 1 ? `${parts.slice(0, -1).join("_")}_general` : null;

  if (parentKey) {
    for (const bucket of bucketOrderForAudience(buyerType, audience)) {
      const list = CATEGORY_TEMPLATES[parentKey]?.[bucket];
      if (list && list.length > 0) return list;
    }
  }

  for (const bucket of bucketOrderForAudience(buyerType, audience)) {
    const list = CATEGORY_TEMPLATES.general[bucket];
    if (list && list.length > 0) return list;
  }
  return [];
}
