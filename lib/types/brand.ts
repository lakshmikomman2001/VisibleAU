export interface BrandClassification {
  category: string;
  buyerType: "smb" | "enterprise" | "consumer" | "freelancer" | "agency" | "mixed";
  intentSignals: string[];
  competitors: string[];
  auRelevance: "au_founded" | "au_strong" | "au_present" | "au_limited";
  confidence: number;
}
