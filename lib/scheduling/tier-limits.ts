export const TIER_AUDIT_LIMITS = {
  free:       { auditsPerMonth: 1,    brandsMax: 1,  frequency: "manual" as const,     maxScheduled: 0  },
  starter:    { auditsPerMonth: 4,    brandsMax: 1,  frequency: "weekly" as const,     maxScheduled: 1  },
  growth:     { auditsPerMonth: 12,   brandsMax: 1,  frequency: "3x_weekly" as const,  maxScheduled: 1  },
  agency:     { auditsPerBrandPerMonth: 30,  brandsMax: 5,  frequency: "daily" as const,     maxScheduled: 5  },
  agency_pro: { auditsPerBrandPerMonth: 60,  brandsMax: 25, frequency: "2x_daily" as const,  maxScheduled: 25 },
  enterprise: { auditsPerBrandPerMonth: Infinity, brandsMax: Infinity, frequency: "daily" as const, maxScheduled: Infinity },
} as const;
