export function VerticalsSupported() {
  const verticals = [
    {
      name: "AU Tradies",
      icon: "🔧",
      desc: "Plumbers, electricians, builders, landscapers, cleaners",
      prompts: 60,
      eg: '"best plumber in Bondi"',
    },
    {
      name: "Allied Health",
      icon: "🏥",
      desc: "Physios, dentists, optometrists, psychologists",
      prompts: 55,
      eg: '"recommend a physio in Melbourne"',
    },
    {
      name: "Professional Services",
      icon: "💼",
      desc: "Accountants, lawyers, financial advisers, IT consultants",
      prompts: 50,
      eg: '"best accountant for small business Sydney"',
    },
  ];

  return (
    <section className="py-20 px-6">
      <h2 className="text-3xl font-bold text-center mb-12">
        Built for Australian service businesses
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {verticals.map((v) => (
          <div key={v.name} className="rounded-xl border p-6">
            <div className="text-3xl mb-3">{v.icon}</div>
            <h3 className="font-semibold mb-1">{v.name}</h3>
            <span className="inline-block rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
              {v.prompts} prompt templates
            </span>
            <p className="text-sm text-muted-foreground mt-2">{v.desc}</p>
            <p className="text-xs text-muted-foreground mt-2 italic">
              e.g. {v.eg}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
