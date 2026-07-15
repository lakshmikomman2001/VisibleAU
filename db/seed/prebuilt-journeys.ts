import type { JourneyTurn } from "@/lib/conversational/types";

export interface PrebuiltJourney {
  journeyName: string;
  vertical: string;
  buyerStage: string;
  promptSequence: JourneyTurn[];
}

export const PREBUILT_JOURNEYS: PrebuiltJourney[] = [
  // ── Tradies ──
  {
    journeyName: "Service Discovery",
    vertical: "tradies",
    buyerStage: "awareness",
    promptSequence: [
      { turn: 1, prompt: "What are the best {serviceType} in {location}?", intent: "awareness" },
      { turn: 2, prompt: "Tell me more about {brandName}", intent: "followup" },
      { turn: 3, prompt: "How does {brandName} compare to other {serviceType}?", intent: "compare" },
      { turn: 4, prompt: "Should I book {brandName} for my job?", intent: "decide" },
    ],
  },
  {
    journeyName: "Emergency Booking",
    vertical: "tradies",
    buyerStage: "decision",
    promptSequence: [
      { turn: 1, prompt: "I need an emergency {serviceType} right now in my area", intent: "awareness" },
      { turn: 2, prompt: "Which of those can come within the hour?", intent: "followup" },
      { turn: 3, prompt: "Is {brandName} reliable for after-hours work?", intent: "compare" },
      { turn: 4, prompt: "How do I book {brandName} for tonight?", intent: "decide" },
    ],
  },
  {
    journeyName: "Competitor Comparison",
    vertical: "tradies",
    buyerStage: "consideration",
    promptSequence: [
      { turn: 1, prompt: "Compare the top {serviceType} in {location}", intent: "awareness" },
      { turn: 2, prompt: "What makes {brandName} different from the others?", intent: "followup" },
      { turn: 3, prompt: "Which one has the best reviews and pricing?", intent: "compare" },
    ],
  },

  // ── Allied Health ──
  {
    journeyName: "Provider Discovery",
    vertical: "allied_health",
    buyerStage: "awareness",
    promptSequence: [
      { turn: 1, prompt: "Find me a good {serviceType} near me", intent: "awareness" },
      { turn: 2, prompt: "What services does {brandName} offer?", intent: "followup" },
      { turn: 3, prompt: "How does {brandName} compare to other {serviceType}?", intent: "compare" },
      { turn: 4, prompt: "Can I book an initial consultation with {brandName}?", intent: "decide" },
    ],
  },
  {
    journeyName: "Specialist Search",
    vertical: "allied_health",
    buyerStage: "consideration",
    promptSequence: [
      { turn: 1, prompt: "Who are the best {serviceType} in {location}?", intent: "awareness" },
      { turn: 2, prompt: "Does {brandName} specialise in my condition?", intent: "followup" },
      { turn: 3, prompt: "Compare {brandName} with other {serviceType}", intent: "compare" },
    ],
  },
  {
    journeyName: "Treatment Decision",
    vertical: "allied_health",
    buyerStage: "decision",
    promptSequence: [
      { turn: 1, prompt: "I have chronic pain, what treatment options are there?", intent: "awareness" },
      { turn: 2, prompt: "Which {serviceType} near me offer the treatment I need?", intent: "followup" },
      { turn: 3, prompt: "Tell me about {brandName}'s approach to treatment", intent: "compare" },
      { turn: 4, prompt: "Should I go with {brandName} or try somewhere else?", intent: "decide" },
    ],
  },

  // ── SaaS ──
  {
    journeyName: "Software Discovery",
    vertical: "saas",
    buyerStage: "awareness",
    promptSequence: [
      { turn: 1, prompt: "What are the best {serviceType} for small teams?", intent: "awareness" },
      { turn: 2, prompt: "Tell me about {brandName}'s features", intent: "followup" },
      { turn: 3, prompt: "How does {brandName} compare to the alternatives?", intent: "compare" },
      { turn: 4, prompt: "Is {brandName} worth the price for a 10-person team?", intent: "decide" },
    ],
  },
  {
    journeyName: "Enterprise Evaluation",
    vertical: "saas",
    buyerStage: "consideration",
    promptSequence: [
      { turn: 1, prompt: "Best enterprise {serviceType} for Australian businesses", intent: "awareness" },
      { turn: 2, prompt: "Does {brandName} support Australian data residency?", intent: "followup" },
      { turn: 3, prompt: "Compare {brandName} pricing with the market leaders", intent: "compare" },
      { turn: 4, prompt: "What's the onboarding process like for {brandName}?", intent: "followup" },
      { turn: 5, prompt: "Should our company switch to {brandName}?", intent: "decide" },
    ],
  },
  {
    journeyName: "Integration Check",
    vertical: "saas",
    buyerStage: "decision",
    promptSequence: [
      { turn: 1, prompt: "What {serviceType} integrate with my existing stack?", intent: "awareness" },
      { turn: 2, prompt: "Does {brandName} have the integrations I need?", intent: "followup" },
      { turn: 3, prompt: "How easy is it to set up {brandName}?", intent: "decide" },
    ],
  },

  // ── Professional Services ──
  {
    journeyName: "Firm Discovery",
    vertical: "professional_services",
    buyerStage: "awareness",
    promptSequence: [
      { turn: 1, prompt: "Best {serviceType} for small business in {location}", intent: "awareness" },
      { turn: 2, prompt: "What services does {brandName} offer?", intent: "followup" },
      { turn: 3, prompt: "How does {brandName}'s pricing compare to other firms?", intent: "compare" },
      { turn: 4, prompt: "Should I engage {brandName} for my business needs?", intent: "decide" },
    ],
  },
  {
    journeyName: "Specialist Search",
    vertical: "professional_services",
    buyerStage: "consideration",
    promptSequence: [
      { turn: 1, prompt: "Find me a good {serviceType} in {location}", intent: "awareness" },
      { turn: 2, prompt: "What does {brandName} specialise in?", intent: "followup" },
      { turn: 3, prompt: "Compare {brandName} with other {serviceType}", intent: "compare" },
    ],
  },
  {
    journeyName: "Advisor Selection",
    vertical: "professional_services",
    buyerStage: "decision",
    promptSequence: [
      { turn: 1, prompt: "Who are the top {serviceType} in Australia?", intent: "awareness" },
      { turn: 2, prompt: "Is {brandName} properly accredited?", intent: "followup" },
      { turn: 3, prompt: "What do clients say about {brandName}?", intent: "compare" },
      { turn: 4, prompt: "How do I book a consultation with {brandName}?", intent: "decide" },
    ],
  },

  // ── Real Estate ──
  {
    journeyName: "Agent Discovery",
    vertical: "real_estate",
    buyerStage: "awareness",
    promptSequence: [
      { turn: 1, prompt: "Best {serviceType} in {location}", intent: "awareness" },
      { turn: 2, prompt: "Tell me about {brandName}'s recent sales results", intent: "followup" },
      { turn: 3, prompt: "How does {brandName} compare to other local agents?", intent: "compare" },
      { turn: 4, prompt: "Should I list my property with {brandName}?", intent: "decide" },
    ],
  },
  {
    journeyName: "Property Management",
    vertical: "real_estate",
    buyerStage: "consideration",
    promptSequence: [
      { turn: 1, prompt: "Best property managers for rental properties in {location}", intent: "awareness" },
      { turn: 2, prompt: "What are {brandName}'s management fees?", intent: "followup" },
      { turn: 3, prompt: "Compare {brandName} with other property managers", intent: "compare" },
    ],
  },
  {
    journeyName: "Suburb Research",
    vertical: "real_estate",
    buyerStage: "awareness",
    promptSequence: [
      { turn: 1, prompt: "What's the property market like in {location}?", intent: "awareness" },
      { turn: 2, prompt: "Which {serviceType} have the most listings there?", intent: "followup" },
      { turn: 3, prompt: "What do people say about {brandName} as an agency?", intent: "compare" },
      { turn: 4, prompt: "Is {brandName} the right agent for selling in this market?", intent: "decide" },
    ],
  },
];

export function getPrebuiltJourneysForVertical(vertical: string): PrebuiltJourney[] {
  return PREBUILT_JOURNEYS.filter((j) => j.vertical === vertical);
}
