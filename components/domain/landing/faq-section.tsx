"use client";

import { useState } from "react";

const FAQ_ITEMS = [
  {
    q: "How does it work?",
    a: "We send your brand name and domain to ChatGPT, Claude, Gemini, and Perplexity using standardised prompts. We count how often you're mentioned, where, and in what context.",
  },
  {
    q: "Does it use real AI engines?",
    a: "Yes. Every audit calls the actual production APIs — not mocked responses — so results reflect what customers using those tools see right now.",
  },
  {
    q: "How much does it cost?",
    a: "Free plan: 3 audits/month across 2 engines. Starter from A$99/mo inc. GST. See full pricing.",
  },
  {
    q: "Is my data safe?",
    a: "Your domain and business name are sent to LLM providers via their API. We don't store prompt inputs beyond 24 hours. We comply with Australia's Privacy Act 1988.",
  },
  {
    q: "How long does an audit take?",
    a: "2–5 minutes for a full paid-tier audit (200 LLM calls). Free sample takes ~90 seconds (5 calls, 1 engine).",
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
    a: "It's how often and how positively your business is mentioned when someone asks an AI assistant about your service category and location.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 max-w-3xl mx-auto px-6">
      <h2 className="text-3xl font-bold text-center mb-10">
        Frequently asked questions
      </h2>
      <div className="divide-y">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between py-4 text-left text-sm font-medium hover:text-primary transition-colors"
            >
              {item.q}
              <span className="ml-2 text-muted-foreground">
                {openIndex === i ? "−" : "+"}
              </span>
            </button>
            {openIndex === i && (
              <p className="pb-4 text-sm text-muted-foreground">{item.a}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
