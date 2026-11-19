"use client";

import { useState } from "react";
import {
  AUDIT_AI_PROVIDERS,
  AUDIT_QUESTIONS,
  AUDIT_RESULTS_DELETED,
  FREE_PLAN_ENGINE_NAMES,
  KEPT_UNTIL_YOU_ASK,
  SENT_FOR_A_CONFIRMED_LOCATION,
  SENT_WHEN_A_BUSINESS_IS_ADDED,
  SERVER_LOGS_KEPT,
} from "@/lib/legal/data-facts";
import {
  googleAiDataSentence,
  googleAiFaq,
  googleAiTimingSentence,
  type PublicGoogleAi,
} from "@/lib/marketing/google-ai";
import {
  answersPerAudit,
  INDUSTRIES_ANSWER,
  sampleAuditAnswers,
} from "@/lib/marketing/vertical-facts";
import { formatAud, priceTaxSuffix } from "@/lib/pricing/gst";
import { getTierDefinition, TIER_DEFINITIONS, type TierDefinition } from "@/lib/pricing/tiers";

function plan(key: string): TierDefinition {
  const definition = getTierDefinition(key);
  if (!definition) throw new Error(`lib/pricing/tiers.ts has no "${key}" plan`);
  return definition;
}

/** One question and its answer; `link` follows the answer's text ("See full pricing" -> /pricing). */
export interface FaqItem {
  q: string;
  a: string;
  link?: { href: string; text: string };
}

/**
 * "Record costs from what each provider actually reports" (6 Nov), item 3: every count here comes from the constant
 * the code runs on, so the copy can't drift from it -- the sample's questions x engines x runs = answers
 * (lib/sample-audit/config.ts), the plans' from their engines (lib/llm/tier-engines.ts), the prices from tiers.ts.
 *
 * 19 Nov (Sri's review):
 * - "Is my data safe?" names the companies the questions go to, says what DataForSEO gets while Google is on (only
 *   then: `googleAi`), what outlives the 12-month deletion (lib/retention/audit-retention.ts keeps PDF reports and the
 *   evidence archive) and what uploaded server logs leave behind. Not "We comply with Australia's Privacy Act 1988":
 *   a legal claim nobody has checked.
 * - "How long does an audit take?" says when Google's results arrive (while it's on), and that the free sample is
 *   smaller than the Free plan's audit -- the two aren't the same thing.
 * - "How much does it cost?" lists each plan's price from tiers.ts, the Free plan only where /pricing lists it
 *   (`showFreeTier`), and links to /pricing.
 */
export function faqItems({
  googleAi,
  showFreeTier,
}: {
  googleAi: PublicGoogleAi | null;
  showFreeTier: boolean;
}): FaqItem[] {
  const free = plan("free");
  const paid = TIER_DEFINITIONS.filter((t) => t.monthlyPriceCentsIncGst > 0);
  const prices = paid.map((t) => `${t.name} ${formatAud(t.monthlyPriceCentsIncGst)}/mo`);
  const priceList = `${prices.slice(0, -1).join(", ")} and ${prices[prices.length - 1]}`;
  const answers = answersPerAudit();
  const sample = sampleAuditAnswers();
  const sampleSentence = [
    `The free sample audit (no sign-up) is smaller than a plan's audit: it asks ${sample.questions} questions across ${sample.engines} AI engines (${sample.answers} answers).`,
    showFreeTier
      ? `The Free plan's monthly audit gets ${answers.freeAnswers}+ answers across ${answers.freeEngines} engines, and a paid plan's ${answers.paidAnswers}+ across ${answers.paidEngines}.`
      : `A paid plan's audit gets ${answers.paidAnswers}+ answers across ${answers.paidEngines} engines.`,
  ].join(" ");
  const providers = showFreeTier
    ? `${AUDIT_AI_PROVIDERS} (on the Free plan, ${FREE_PLAN_ENGINE_NAMES} only)`
    : AUDIT_AI_PROVIDERS;

  const items: FaqItem[] = [
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
    // 16 Nov (Sri): while the global setting has Google's AI answers on, what they are (lib/marketing/google-ai.ts).
    ...(googleAi ? [googleAiFaq(googleAi)] : []),
    {
      q: "How much does it cost?",
      a: [
        showFreeTier ? `Free plan: ${free.frequency} across ${free.engines} AI engines.` : null,
        `Paid plans: ${priceList}${priceTaxSuffix()}.`,
      ]
        .filter(Boolean)
        .join(" "),
      link: { href: "/pricing", text: "See full pricing" },
    },
    {
      q: "Is my data safe?",
      // Not "prompt inputs aren't stored beyond 24 hours": every audit keeps the questions it sent and the answers it
      // got (citations.prompt, citations.response_text) until the weekly retention job deletes them. 9 Nov: not "your
      // domain is sent to LLM providers" either -- the questions never carry it; the same sentences as the privacy
      // page (lib/legal/data-facts.ts).
      a: [
        `When you run an audit, we send ${AUDIT_QUESTIONS} to ${providers}.`,
        googleAi ? googleAiDataSentence(googleAi) : null,
        SENT_FOR_A_CONFIRMED_LOCATION,
        SENT_WHEN_A_BUSINESS_IS_ADDED,
        "The questions we send and the answers we get back are saved with your audit results.",
        AUDIT_RESULTS_DELETED,
        KEPT_UNTIL_YOU_ASK,
        SERVER_LOGS_KEPT,
      ]
        .filter(Boolean)
        .join(" "),
      link: { href: "/privacy", text: "Read the privacy policy" },
    },
    {
      q: "How long does an audit take?",
      // Vunnara Build 1, Part F.1/F.2: each question is asked once per engine now (the old "200" assumed 5 replayed
      // runs per question -- 4 engines x 10 questions x 5 -- when runs 2-5 were never independent samples, just a
      // cached replay of run 1). "Answers", never "calls". No fixed minutes for a full audit: nothing measures them
      // (audit #36 took 5m 53s, past the old "2-5 minutes"). Google's "about 10 minutes" is the standard queue's,
      // measured 11-12 Nov (lib/marketing/google-ai.ts googleAiArrival).
      a: [
        "A full audit usually takes several minutes. You'll see live progress while it runs.",
        googleAi ? googleAiTimingSentence(googleAi) : null,
        sampleSentence,
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. No lock-in. Cancel from your billing settings at any time. Your plan remains active until the end of the billing period.",
    },
    {
      q: "What industries do you support?",
      // 16 Nov, part 7: what the product really covers (lib/marketing/vertical-facts.ts), not "optimised for
      // professional services. More verticals added regularly."
      a: INDUSTRIES_ANSWER,
    },
    {
      q: 'What is "AI visibility" exactly?',
      // Methodology v2.2 (7 Nov), part 5: the old answer claimed a Sentiment measure that doesn't exist yet.
      a: "It's how often AI assistants name your business when someone asks them about your kind of service in your area.",
    },
  ];
  return items;
}

/**
 * `googleAi` is the landing page's loadGoogleAiClaim() (16 Nov, Sri): while the global setting has Google's AI answers
 * on, the FAQ says what they are and what they mean for the data and the timing; null, and it says nothing about them.
 * `showFreeTier`: the Free plan is mentioned only where /pricing lists it (lib/feature-flags isFreeTierEnabled).
 */
export function FaqSection({
  googleAi = null,
  showFreeTier = false,
}: {
  googleAi?: PublicGoogleAi | null;
  showFreeTier?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const items = faqItems({ googleAi, showFreeTier });

  return (
    <section className="py-20 max-w-3xl mx-auto px-6">
      <h2 className="text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
      <div className="divide-y">
        {items.map((item, i) => (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between py-4 text-left text-sm font-medium hover:text-primary transition-colors"
            >
              {item.q}
              <span className="ml-2 text-muted-foreground">{openIndex === i ? "−" : "+"}</span>
            </button>
            {openIndex === i && (
              <p className="pb-4 text-sm text-muted-foreground">
                {item.a}
                {item.link ? (
                  <>
                    {" "}
                    <a href={item.link.href} className="underline text-primary">
                      {item.link.text}
                    </a>
                  </>
                ) : null}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
