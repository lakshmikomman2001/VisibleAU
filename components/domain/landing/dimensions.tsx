export function WhatsMeasured() {
  const dims = [
    { name: "Frequency", icon: "📊", desc: "How often your brand is mentioned" },
    { name: "Position", icon: "🏆", desc: "Where you appear in AI response lists" },
    { name: "Sentiment", icon: "😊", desc: "Tone of mentions — positive/neutral/negative" },
    { name: "Context", icon: "🔍", desc: "Which prompts trigger your brand" },
    { name: "Accuracy", icon: "✅", desc: "Whether AI facts about you are correct" },
  ];

  return (
    <section className="py-20 px-6 bg-muted/30">
      <h2 className="text-3xl font-bold text-center mb-12">What we measure</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 max-w-5xl mx-auto">
        {dims.map((d) => (
          <div
            key={d.name}
            className="text-center p-4 rounded-xl bg-background border"
          >
            <div className="text-2xl mb-2">{d.icon}</div>
            <h3 className="font-semibold text-sm mb-1">{d.name}</h3>
            <p className="text-xs text-muted-foreground">{d.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
