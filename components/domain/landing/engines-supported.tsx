import { GoogleAiClaim } from "@/components/domain/google-ai/google-ai-claim";
import { googleAiPublicSentence, type PublicGoogleAi } from "@/lib/marketing/google-ai";

/** 16 Nov: `googleAi` is the landing page's loadGoogleAiClaim(): null (or left out) while the global setting has Google off. */
export function EnginesSupported({ googleAi = null }: { googleAi?: PublicGoogleAi | null }) {
  const engines = [
    { name: "ChatGPT", color: "#10a37f" },
    { name: "Claude", color: "#D97706" },
    { name: "Gemini", color: "#4285F4" },
    { name: "Perplexity", color: "#6366f1" },
  ];

  return (
    <section className="py-20 px-6 bg-muted/30">
      <h2 className="text-3xl font-bold text-center mb-4">Engines we audit</h2>
      <div className="flex justify-center gap-8 flex-wrap mb-6">
        {engines.map((e) => (
          <div key={e.name} className="flex flex-col items-center gap-2">
            <div
              className="w-16 h-16 rounded-2xl border flex items-center justify-center"
              style={{ borderColor: e.color + "33" }}
            >
              <span className="text-2xl font-bold" style={{ color: e.color }}>
                {e.name[0]}
              </span>
            </div>
            <span className="text-sm font-medium">{e.name}</span>
          </div>
        ))}
      </div>
      {/* Leftovers task, part 3 (17 Nov): the four engines we audit, and nothing promised. "Coming soon: Microsoft
          Copilot, Google AI Overviews and Google AI Mode" went (nothing audits Copilot; Google runs only for
          workspaces Sri switches on). 16 Nov (Sri): Google's AI answers for Growth and up, said only while the global
          setting has them on. */}
      <GoogleAiClaim googleAi={googleAi}>
        {(g) => (
          <p
            className="text-center text-sm text-muted-foreground max-w-2xl mx-auto"
            data-google-ai-claim=""
          >
            {googleAiPublicSentence(g)}
          </p>
        )}
      </GoogleAiClaim>
    </section>
  );
}
