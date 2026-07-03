import { classifyByScore } from "@/lib/confidence-labels/classify";
import type { SovEntry } from "./types";

interface MentionCount {
  domain: string;
  count: number;
}

interface SovInput {
  engine: string;
  promptCategory: string;
  brandDomain: string;
  mentions: MentionCount[];
  totalPrompts: number;
}

export function calculateShareOfVoice(input: SovInput): SovEntry[] {
  const { engine, promptCategory, brandDomain, mentions, totalPrompts } = input;

  if (totalPrompts === 0) return [];

  const totalMentions = mentions.reduce((sum, m) => sum + m.count, 0);
  if (totalMentions === 0) return [];

  const brandEntry = mentions.find(
    (m) => m.domain.toLowerCase() === brandDomain.toLowerCase(),
  );
  const brandShare = brandEntry
    ? (brandEntry.count / totalMentions) * 100
    : 0;

  const sampleQuality = classifyByScore(
    totalPrompts >= 30 ? 80 : totalPrompts >= 10 ? 50 : 20,
  );

  const competitors = mentions.filter(
    (m) => m.domain.toLowerCase() !== brandDomain.toLowerCase(),
  );

  return competitors.map((competitor) => ({
    competitorDomain: competitor.domain,
    promptCategory,
    engine,
    brandShare: Math.round(brandShare * 100) / 100,
    competitorShare:
      Math.round(((competitor.count / totalMentions) * 100) * 100) / 100,
    totalPrompts,
    sampleQuality,
  }));
}
