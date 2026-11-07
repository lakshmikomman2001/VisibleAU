"use client";

import { useState } from "react";
import { formatAud } from "@/lib/pricing/gst";
import { getTierDefinition, type TierDefinition } from "@/lib/pricing/tiers";
import { SAMPLE_AUDIT_CONFIG } from "@/lib/sample-audit/config";

function plan(key: string): TierDefinition {
  const definition = getTierDefinition(key);
  if (!definition) throw new Error(`lib/pricing/tiers.ts has no "${key}" plan`);
  return definition;
}

const FREE = plan("free");
const STARTER = plan("starter");

// "Record costs from what each provider actually reports" (6 Nov), item 3: every count here
// comes from the constant the code runs on, so the copy can't drift from it -- the sample's
// questions x engines x runs = answers (lib/sample-audit/config.ts), the plans from tiers.ts.
const SAMPLE_ANSWERS =
  SAMPLE_AUDIT_CONFIG.promptsCount *
  SAMPLE_AUDIT_CONFIG.engines.length *
  SAMPLE_AUDIT_CONFIG.runsPerPrompt;
const SAMPLE_AUDIT_SENTENCE = `The free sample asks ${SAMPLE_AUDIT_CONFIG.promptsCount} questions across ${SAMPLE_AUDIT_CONFIG.engines.length} AI engines (${SAMPLE_ANSWERS} answers).`;

const FAQ_ITEMS = [
  {
    q: "How does it work?",
    // Methodology v2.2 (7 Nov), part 5: what an audit sends and measures. The questions carry the business's
    // name (the branded ones), never its domain. The old answer claimed a Context measure that doesn't exist yet.
    a: "We ask ChatGPT, Claude, Gemini, and Perplexity the questions your customers ask, plus a few that name your business. We count how often the answers mention you, where they place you, and which sources they cite.",
  },
  {
    q: "Does it use real AI engines?",
    a: "Yes. Every audit calls the actual production APIs — not mocked responses — so results reflect what customers using those tools see right now.",
  },
  {
    q: "How much does it cost?",
    a: `Free plan: ${FREE.frequency} across ${FREE.engines} AI engines. ${STARTER.name} from ${formatAud(STARTER.monthlyPriceCentsIncGst)}/mo inc. GST. See full pricing.`,
  },
  {
    q: "Is my data safe?",
    // Not "prompt inputs aren't stored beyond 24 hours": every audit keeps the questions it
    // sent and the answers it got (citations.prompt, citations.response_text).
    a: "Your domain and business name are sent to LLM providers via their API. The questions we send and the answers we get back are saved with your audit results. We comply with Australia's Privacy Act 1988.",
  },
  {
    q: "How long does an audit take?",
    // Vunnara Build 1, Part F.1/F.2: each question is asked once per
    // engine now (the old "200" assumed 5 replayed runs per question --
    // 4 engines x 10 questions x 5 -- when runs 2-5 were never
    // independent samples, just a cached replay of run 1). "Answers",
    // never "calls". No fixed minutes for a full audit: nothing measures
    // them (audit #36 took 5m 53s, past the old "2-5 minutes").
    a: `A full audit usually takes several minutes. You'll see live progress while it runs. ${SAMPLE_AUDIT_SENTENCE}`,
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No lock-in. Cancel from your billing settings at any time. Your plan remains active until the end of the billing period.",
  },
  {
    q: "What industries do you support?",
    a: "Currently optimised for AU tradies, allied health, and professional services. More verticals added regularly.",
  },
  {
    q: 'What is "AI visibility" exactly?',
    // Methodology v2.2 (7 Nov), part 5: the old answer claimed a Sentiment measure that doesn't exist yet.
    a: "It's how often AI assistants name your business when someone asks them about your kind of service in your area.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 max-w-3xl mx-auto px-6">
      <h2 className="text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
      <div className="divide-y">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between py-4 text-left text-sm font-medium hover:text-primary transition-colors"
            >
              {item.q}
              <span className="ml-2 text-muted-foreground">{openIndex === i ? "−" : "+"}</span>
            </button>
            {openIndex === i && <p className="pb-4 text-sm text-muted-foreground">{item.a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
