import type { TopicalGap } from "./types";

interface PromptTopic {
  topic: string;
  promptId: string;
  brandMentioned: boolean;
  competitorDomains: string[];
}

interface TopicalGapInput {
  brandId: string;
  vertical: string;
  promptTopics: PromptTopic[];
  brandDomain: string;
}

function hyphenToUnderscore(topic: string): string {
  return topic.replace(/-/g, "_");
}

function toTitleCase(topic: string): string {
  return topic
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function calculateTopicalGaps(input: TopicalGapInput): TopicalGap[] {
  const { vertical, promptTopics, brandDomain } = input;

  const topicMap = new Map<
    string,
    {
      prompts: PromptTopic[];
      brandAppearCount: number;
      competitors: Map<string, number>;
    }
  >();

  for (const pt of promptTopics) {
    if (!pt.topic) continue;
    const cluster = hyphenToUnderscore(pt.topic);
    let entry = topicMap.get(cluster);
    if (!entry) {
      entry = {
        prompts: [],
        brandAppearCount: 0,
        competitors: new Map(),
      };
    }
    entry.prompts.push(pt);
    if (pt.brandMentioned) entry.brandAppearCount++;
    for (const domain of pt.competitorDomains) {
      if (domain.toLowerCase() !== brandDomain.toLowerCase()) {
        entry.competitors.set(domain, (entry.competitors.get(domain) ?? 0) + 1);
      }
    }
    topicMap.set(cluster, entry);
  }

  const gaps: TopicalGap[] = [];

  for (const [cluster, data] of topicMap) {
    const brandHasContent = data.brandAppearCount > 0;
    const totalPrompts = data.prompts.length;
    const brandDepth = brandHasContent
      ? Math.round((data.brandAppearCount / totalPrompts) * 100)
      : 0;

    const competitorCoverage = Array.from(data.competitors.entries()).map(
      ([domain, count]) => ({
        domain,
        has_content: count > 0,
        depth: Math.round((count / totalPrompts) * 100),
        passage_count: count,
      }),
    );

    const maxCompetitorDepth = competitorCoverage.reduce(
      (max, c) => Math.max(max, c.depth),
      0,
    );
    const citationImpact =
      maxCompetitorDepth > 0
        ? Math.round((maxCompetitorDepth - brandDepth) * 0.5 * 100) / 100
        : null;

    gaps.push({
      topicCluster: cluster,
      topicLabel: toTitleCase(cluster),
      vertical,
      brandHasContent,
      brandContentDepth: brandDepth,
      brandPassageCount: data.brandAppearCount,
      competitorCoverage,
      estimatedCitationImpact: citationImpact,
      crossPromptImpact: null,
    });
  }

  return gaps;
}

export function computeCrossPromptImpact(
  gaps: TopicalGap[],
  promptTopicCounts: Map<string, number>,
): TopicalGap[] {
  return gaps.map((gap) => {
    const count = promptTopicCounts.get(gap.topicCluster) ?? 0;
    return {
      ...gap,
      crossPromptImpact: count >= 2 ? count : null,
    };
  });
}

export { hyphenToUnderscore };
