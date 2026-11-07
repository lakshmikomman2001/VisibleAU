export function WhatsMeasured() {
  // Display-only relabel: this dimension measures citation rate (accuracyDimensionScore), not
  // factual correctness. DB column (score_accuracy) and internal key (accuracy) are unchanged —
  // see docs/ops for the Phase 1 writeup.
  // Methodology v2.2 (Sri's decision, 7 Nov), part 5: only what an audit measures is described as
  // measured. Sentiment and Context have no classifier yet (lib/scoring/measured-display.ts's
  // NOT_MEASURED_REASONS), so they say "Coming soon" and what they will show.
  const dims = [
    {
      name: "Frequency",
      icon: "📊",
      desc: "How often AI answers name your business: your Visibility score",
      comingSoon: false,
    },
    {
      name: "Position",
      icon: "🏆",
      desc: "Where you appear in AI response lists",
      comingSoon: false,
    },
    {
      name: "Source citation",
      icon: "✅",
      desc: "How often answers that mention you cite a source",
      comingSoon: false,
    },
    {
      name: "Sentiment",
      icon: "😊",
      desc: "Will show the tone of each mention: positive, neutral or negative",
      comingSoon: true,
    },
    {
      name: "Context",
      icon: "🔍",
      desc: "Will show whether answers recommend you or only list you",
      comingSoon: true,
    },
  ];

  return (
    <section className="py-20 px-6 bg-muted/30">
      <h2 className="text-3xl font-bold text-center mb-12">What we measure</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 max-w-5xl mx-auto">
        {dims.map((d) => (
          <div
            key={d.name}
            data-dimension={d.name}
            className="text-center p-4 rounded-xl bg-background border"
          >
            <div className="text-2xl mb-2">{d.icon}</div>
            <h3 className="font-semibold text-sm mb-1">{d.name}</h3>
            {d.comingSoon && (
              <p data-coming-soon className="text-xs font-medium text-muted-foreground mb-1">
                Coming soon
              </p>
            )}
            <p className="text-xs text-muted-foreground">{d.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
