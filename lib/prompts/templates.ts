export type BuyerType = "smb" | "enterprise" | "consumer" | "freelancer" | "agency" | "mixed";

export type PromptTemplateMap = Partial<Record<BuyerType, string[]>>;

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
      "Reliable plumber {region} available on weekends?",
      "Licensed plumber for hot water system replacement {region}?",
      "Who are the top-rated plumbers in {region}?",
      "Best plumbing companies for commercial fitouts in {region}?",
    ],
  },
  trades_electrical: {
    smb: [
      "Best electricians in {region} for home renovations?",
      "Licensed electrician for switchboard upgrade {region}?",
      "Who are the most reliable electricians in {region}?",
      "Electricians that handle solar panel installation in {region}?",
      "Emergency electrician {region} available 24/7?",
    ],
  },
  trades_building: {
    smb: [
      "Best builders in {region} for home extensions?",
      "Top-rated construction companies in {region}?",
      "Licensed builder for knockdown rebuild {region}?",
      "Best residential builders in {region} for new homes?",
    ],
  },
  trades_general: {
    smb: [
      "Best trade services in {region} for home maintenance?",
      "Top-rated tradies in {region} reviewed on hipages?",
      "Affordable and reliable tradies near {region}?",
      "Most recommended trade businesses in {region}?",
    ],
  },

  allied_health_dental: {
    smb: [
      "Best dentists in {region} accepting new patients?",
      "Affordable dental clinics in {region} with payment plans?",
      "Top-rated dental practices in {region} on Google?",
      "Best cosmetic dentists in {region} for teeth whitening?",
      "Family dentist {region} bulk billing or low-gap?",
    ],
  },
  allied_health_physio: {
    smb: [
      "Best physiotherapists in {region} for sports injuries?",
      "Top-rated physio clinics in {region}?",
      "Physiotherapy for lower back pain {region}?",
      "Best physiotherapy clinics near {region} with HICAPS?",
    ],
  },
  allied_health_mental: {
    smb: [
      "Best psychologists in {region} accepting new clients?",
      "Affordable mental health support in {region}?",
      "Counsellors and therapists in {region} with Medicare rebates?",
      "Best anxiety and depression treatment {region}?",
    ],
  },
  allied_health_general: {
    smb: [
      "Best health clinics in {region} accepting new patients?",
      "Top-rated allied health providers in {region}?",
      "Allied health services in {region} with private health rebates?",
    ],
  },

  legal_services: {
    smb: [
      "Best commercial lawyers in {region} for small businesses?",
      "Top-rated law firms in {region} for employment law?",
      "Affordable business lawyers in {region}?",
      "Best conveyancing solicitors in {region}?",
      "Law firms in {region} specialising in contract disputes?",
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
    ],
  },

  education_online: {
    consumer: [
      "Best online learning platforms in Australia?",
      "Most popular online course providers for Australians?",
      "Affordable online professional development in Australia?",
      "Best platforms to learn coding online in Australia?",
      "Online certifications recognised by Australian employers?",
    ],
  },

  hospitality_restaurant: {
    consumer: [
      "Best restaurants in {region} for a special occasion?",
      "Top-rated cafes in {region} on Google Maps?",
      "Best BYO restaurants in {region}?",
      "Most popular brunch spots in {region}?",
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

export function getTemplatesForCategory(category: string, buyerType: BuyerType): string[] {
  const exact =
    CATEGORY_TEMPLATES[category]?.[buyerType] ??
    CATEGORY_TEMPLATES[category]?.smb ??
    CATEGORY_TEMPLATES[category]?.consumer;

  if (exact && exact.length > 0) return exact;

  const parts = category.split("_");
  const parentKey = parts.length > 1 ? `${parts.slice(0, -1).join("_")}_general` : null;

  if (parentKey) {
    const parent = CATEGORY_TEMPLATES[parentKey]?.[buyerType] ?? CATEGORY_TEMPLATES[parentKey]?.smb;
    if (parent && parent.length > 0) return parent;
  }

  return CATEGORY_TEMPLATES.general[buyerType] ?? CATEGORY_TEMPLATES.general.smb ?? [];
}
