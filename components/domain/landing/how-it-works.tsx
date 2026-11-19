import { answersPerAudit, sampleAuditAnswers } from "@/lib/marketing/vertical-facts";

// 16 Nov, part 7: the answer counts come from each plan's engines (lib/llm/tier-engines.ts), not written in.
const ANSWERS = answersPerAudit();
// 19 Nov (Sri's review): the anonymous sample on this page isn't the Free plan's audit -- it's smaller
// (lib/sample-audit/config.ts) -- and both are said, so "20+ answers" here and "12 answers" in the FAQ don't read as a
// contradiction.
const SAMPLE = sampleAuditAnswers();

/** `showFreeTier`: the Free plan is mentioned only where /pricing lists it (lib/feature-flags isFreeTierEnabled). */
export function HowItWorks({ showFreeTier }: { showFreeTier: boolean }) {
  const steps = [
    {
      n: 1,
      title: "Enter your domain",
      desc: "Add your business domain and select your industry vertical.",
    },
    {
      n: 2,
      title: "AI engines scan your brand",
      // Vunnara Build 1, Part F.1/F.2: each question is asked once per
      // engine now (the old "200"/"100" assumed 5 replayed runs per
      // question, never an independent sample). "Answers", never
      // "calls".
      desc: [
        "We send standardised questions across ChatGPT, Claude, Gemini, and Perplexity.",
        `Each audit on a paid plan: ${ANSWERS.paidAnswers}+ answers across ${ANSWERS.paidEngines} engines.`,
        showFreeTier
          ? `The Free plan's monthly audit: ${ANSWERS.freeAnswers}+ answers across ${ANSWERS.freeEngines} engines.`
          : null,
        `The free sample audit, with no sign-up, is smaller: ${SAMPLE.questions} questions across ${SAMPLE.engines} engines (${SAMPLE.answers} answers).`,
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      n: 3,
      title: "See your visibility score",
      // Sri's decision 2 (7 Nov): the score is the mention rate (the Visibility headline), never
      // a composite -- see the Methodology page's "What the Visibility Score measures".
      desc: "Your Visibility Score is how often AI answers mention your business, shown with where you're placed and which sources the answers cite, plus specific recommendations.",
    },
  ];

  return (
    <section className="py-20 px-6">
      <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {steps.map((s) => (
          <div key={s.n} className="text-center" data-how-step={s.n}>
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
