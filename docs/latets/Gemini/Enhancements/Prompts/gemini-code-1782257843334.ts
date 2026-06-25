// db/schema/phase2-visibility-extensions.ts
// Part of the GA4 AI Traffic Attribution Core (v8.19 / ChatGPT Review)[cite: 5]
export const visibilityTrendsExtensions = {
  aiReferralSessions: integer('ai_referral_sessions'), // Direct unmasked GA4 session count[cite: 5]
  aiLeadEstimate: numeric('ai_lead_estimate', { precision: 8, scale: 2 }), // Referral sessions * GA4 conversion rate[cite: 5]
  marketCompetitionLabel: text('market_competition_label'), // 'category_leader' | 'challenger' | 'niche_player'[cite: 5]
};