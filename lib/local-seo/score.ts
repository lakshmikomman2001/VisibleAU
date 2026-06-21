export interface LocalSeoInputs {
  gmb: { present: boolean; completeness: number };
  directories: Array<{ present: boolean }>;
  nap: { score: number };
  suburbs: Array<{
    mentionedInContent: boolean;
    mentionedInMeta: boolean;
    mentionedInSchema: boolean;
  }>;
}

export function computeLocalSeoScore(inputs: LocalSeoInputs): number {
  const gmbScore = inputs.gmb.present ? inputs.gmb.completeness : 0;
  const napScore = inputs.nap.score;
  const dirScore =
    inputs.directories.length > 0
      ? (inputs.directories.filter((d) => d.present).length /
          inputs.directories.length) *
        100
      : 0;
  const suburbScore =
    inputs.suburbs.length > 0
      ? (inputs.suburbs.filter(
          (s) => s.mentionedInContent || s.mentionedInMeta || s.mentionedInSchema,
        ).length /
          inputs.suburbs.length) *
        100
      : 100;

  return Number(
    (
      gmbScore * 0.3 +
      napScore * 0.3 +
      dirScore * 0.25 +
      suburbScore * 0.15
    ).toFixed(2),
  );
}
