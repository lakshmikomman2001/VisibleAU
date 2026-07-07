export function formatRate(value: number | string): string {
  return `${Number(value).toFixed(1)}%`;
}

export function formatRatio(ratio: number | null): string {
  if (ratio == null) return "N/A (brand not mentioned)";
  return Number(ratio).toFixed(2);
}

const QUADRANT: Record<string, { label: string; meaning: string; action: string }> = {
  recognised_authority: { label: "recognised authority", meaning: "AI engines both mention and cite the brand", action: "maintain and defend the position" },
  known_but_untrusted: { label: "known but untrusted", meaning: "the brand is mentioned but rarely cited as a source", action: "fix content structure so AI engines trust and cite it" },
  niche_authority: { label: "niche authority", meaning: "the brand is cited when it appears, but mention volume is low", action: "expand prompt coverage to surface in more queries" },
  invisible: { label: "invisible", meaning: "the brand is neither mentioned nor cited", action: "a full GEO strategy to establish presence" },
};

export function buildMentionSourceSection(archetype: string, ratio: number | null): string {
  const q = QUADRANT[archetype] ?? QUADRANT.invisible;
  const ratioText = formatRatio(ratio);
  return (
    `The brand sits in the ${q.label} quadrant — ${q.meaning}. ` +
    `Mention-to-citation ratio: ${ratioText}. ` +
    `Priority: ${q.action}.`
  );
}
