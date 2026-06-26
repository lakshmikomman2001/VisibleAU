export function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Enter your domain",
      desc: "Add your business domain and select your industry vertical.",
    },
    {
      n: 2,
      title: "AI engines scan your brand",
      desc: "We send standardised prompts across ChatGPT, Claude, Gemini, and Perplexity. Paid: up to 200 calls × 4 engines. Free: 100 calls × 2 engines.",
    },
    {
      n: 3,
      title: "See your visibility score",
      desc: "Get a composite score across 5 dimensions with specific recommendations.",
    },
  ];

  return (
    <section className="py-20 px-6">
      <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {steps.map((s) => (
          <div key={s.n} className="text-center">
            <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center mx-auto mb-4">
              {s.n}
            </div>
            <h3 className="font-semibold mb-2">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
