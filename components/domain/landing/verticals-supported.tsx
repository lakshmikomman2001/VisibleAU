import { exampleQuestion, templateCount, verticalTypes } from "@/lib/marketing/vertical-facts";

/**
 * The landing page's "Built for Australian local businesses". 16 Nov, part 7: every count and example comes from
 * the product's own business types and question templates (lib/marketing/vertical-facts.ts) -- it said "60 / 55 / 50
 * prompt templates", which matched nothing, and listed businesses with no type of their own.
 */
const CARDS = [
  {
    vertical: "tradies",
    name: "Tradies",
    icon: "🔧",
    desc: "Plumbers, electricians, builders and other trades",
    example: { type: "trades_plumbing", place: "Bondi" },
  },
  {
    vertical: "allied_health",
    name: "Allied health",
    icon: "🏥",
    desc: "Dentists, physios, psychologists and other clinics",
    example: { type: "allied_health_physio", place: "Fitzroy" },
  },
  {
    vertical: "local_business",
    name: "Local businesses",
    icon: "🏪",
    desc: "Cafés, restaurants, gyms, salons, shops, accountants, lawyers, real estate agents",
    example: { type: "cafe", place: "Parramatta" },
  },
] as const;

export function VerticalsSupported() {
  return (
    <section className="py-20 px-6">
      <h2 className="text-3xl font-bold text-center mb-12">
        Built for Australian local businesses
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {CARDS.map((v) => (
          <div key={v.name} className="rounded-xl border p-6" data-vertical-card={v.vertical}>
            <div className="text-3xl mb-3">{v.icon}</div>
            <h3 className="font-semibold mb-1">{v.name}</h3>
            <span className="inline-block rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
              {templateCount(verticalTypes(v.vertical))} question templates
            </span>
            <p className="text-sm text-muted-foreground mt-2">{v.desc}</p>
            <p className="text-xs text-muted-foreground mt-2 italic">
              e.g. &ldquo;{exampleQuestion(v.example.type, v.example.place)}&rdquo;
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
