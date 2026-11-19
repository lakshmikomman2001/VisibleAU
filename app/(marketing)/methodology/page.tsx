import type { Metadata } from "next";
import { GoogleAiClaim } from "@/components/domain/google-ai/google-ai-claim";
import { GoogleAiMethodology } from "@/components/domain/google-ai/google-ai-methodology";
import { loadGoogleAiClaim } from "@/components/domain/google-ai/load-google-ai-claim";
import { OPTIONAL_AI_FILES_LABEL } from "@/lib/ai-discovery/endpoints";
import { CANT_TEST_FROM_OUTSIDE } from "@/lib/crawler/access-copy";
import { methodologyLabel } from "@/lib/llm/methodology";
import { getMethodsData } from "@/lib/methodology/methods";
import {
  TECHNICAL_SCORING_SOURCES,
  VERIFIED_CITATIONS,
} from "@/lib/methodology/verified-citations";
import { CRAWLER_USER_AGENT, PRODUCT_NAME } from "@/lib/product";
import { SEARCH_CRAWLERS, VISITING_AI_CRAWLERS } from "@/lib/robots-txt/evaluate";
import { buildMetadata } from "@/lib/seo/metadata";
import { TECHNICAL_AUDIT_MAX_SCORE } from "@/lib/technical-audit/score-aggregator";
import { MethodologyContent } from "./methodology-content";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Methodology",
    path: "/methodology",
    description: `Research-backed citability methods drawn from real studies. See how ${PRODUCT_NAME} measures AI search visibility.`,
  });
}

// ⚠️ Every entry here must have a `url` that actually opens and actually
// contains the described finding -- task NN removed an entry for a
// fabricated "SE Ranking 2025 ChatGPT Citation Study" that doesn't exist
// (confirmed: no such study, anywhere), plus three entries (BrightEdge,
// Onely, AirOps) that no CITABILITY_METHODS entry cites with a verified
// figure any more. No aggregator-only, secondhand, or unsourced entries.
// 19 Nov (Sri's review): each source's name and link is lib/methodology/verified-citations.ts's (re-opened that day),
// every source a method cites is listed, and each says what it measured. "Zyppy / Leapd" went: the 44.2% figure is
// Kevin Indig's (Leapd credited Zyppy, with no link, and no Zyppy study has it).
const RESEARCH_SOURCES = [
  {
    ...VERIFIED_CITATIONS.aggarwalGEO,
    description:
      "Generative Engine Optimization — method-level visibility improvements on GEO-bench",
  },
  {
    ...VERIFIED_CITATIONS.ahrefsBenchmark,
    description:
      "Correlations between brand signals and how often 75,000 brands are mentioned in AI answers; correlations, not measured lifts, and not Claude, Gemini or Perplexity",
  },
  {
    ...VERIFIED_CITATIONS.ahrefsSchema,
    description:
      "Tracked AI citations for 1,885 pages before and after they added JSON-LD schema (Aug 2025–Mar 2026), against 4,000 control pages; found no statistically significant lift for ChatGPT or Google AI Mode — schema alone doesn't reliably move AI citations",
  },
  {
    ...VERIFIED_CITATIONS.indigFrontLoad,
    description:
      "Where on a page ChatGPT's citations come from: 18,012 verified citations from about 3 million ChatGPT answers (Gauge's data)",
  },
  {
    ...VERIFIED_CITATIONS.ahrefsMisinformation,
    description:
      "A made-up brand tested on 8 AI tools: after fake sources were planted, most of them repeated fabricated claims as fact",
  },
] as const;

/** "GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, ..." -- the crawlers and agents the checks read robots.txt for. */
const crawlerList = VISITING_AI_CRAWLERS.map((c) => c.crawler).join(", ");

/** "OAI-SearchBot, Claude-SearchBot, Googlebot and PerplexityBot": the only crawlers the robots.txt score counts. */
const searchCrawlerList = `${SEARCH_CRAWLERS.slice(0, -1).join(", ")} and ${SEARCH_CRAWLERS[SEARCH_CRAWLERS.length - 1]}`;

/** Google's own page for Gemini model shutdowns (it redirects to aistudio.google.com/docs/deprecations). */
const GEMINI_DEPRECATIONS_URL = "https://ai.google.dev/gemini-api/docs/deprecations";

export default async function MethodologyPage() {
  const { top10, all, total } = getMethodsData();
  const remaining = all.slice(10);
  const googleAi = await loadGoogleAiClaim();

  return (
    <article className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-4">{PRODUCT_NAME} Methodology</h1>
      {/* 19 Nov (Sri's review): it said "10 of the highest-impact methods", but several are directional and there are
          12 in all. */}
      <p className="text-muted-foreground mb-10">
        {`Our recommendations draw on published research into how AI engines choose what to cite, including the Princeton GEO study (KDD 2024) and Ahrefs' studies of AI answers. Below are ${top10.length} of our ${total} methods, each with how strong its evidence is: an effect measured by the source, a correlation (not a guaranteed lift), or a directional best practice without a verified figure.`}
      </p>

      {/* Vunnara (19 Oct, post-aa83b3a), "the headline is the mention
          rate": this is the public "Methodology" page (footer.tsx links
          here) -- state plainly what the Visibility Score actually is
          now (a mention rate, never a blend), and that Position/Source
          citation/Sentiment/Context are detail shown separately. */}
      <section className="rounded-xl border p-5 mb-10 bg-muted/30">
        <h2 className="font-semibold mb-2">What the Visibility Score measures</h2>
        <p className="text-sm text-muted-foreground mb-2">
          The Visibility Score is how often AI answers mention your business when customers ask
          everyday questions about businesses like yours — never a question that names your business
          directly. A question that does name it is shown separately, on its own, and is never
          counted toward this score.
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          Position (where in the answer you&apos;re mentioned) and Source citation (how often a
          mention links to a source) describe how you appear in the answers that DO mention you —
          they&apos;re shown next to the score, but they never change the score itself. Sentiment
          and Context aren&apos;t scored — no tone or framing classifier exists — so both are marked
          &quot;Not scored&quot; rather than shown as a number.
        </p>
        <p className="text-sm text-muted-foreground">
          From 19 Oct 2026, the Visibility Score is the mention rate. Earlier audits are
          recalculated the same way, every time they&apos;re viewed — there&apos;s no separate,
          older scoring method still applying to older audits.
        </p>
      </section>

      {/* Vunnara Build 1, Part H: how an audit's answers are actually
          gathered -- question selection, web search, run count, the
          cache-sharing caveat, and the location caveat. None of this was
          disclosed anywhere before this section. */}
      <section className="rounded-xl border p-5 mb-10 bg-muted/30">
        <h2 className="font-semibold mb-2">How we gather answers</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Each brand gets a fixed set of questions, generated once from its confirmed categories
          plus a few that name the brand directly. The same questions are reused on every later
          audit unless the brand&apos;s categories, competitors, or location change — so a trend
          line compares like with like, not a freshly-randomised set each time.
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          Most engines search the live web for each answer by default, so a response can reflect
          what&apos;s actually online right now rather than only older training data. Each question
          is asked once per engine per audit — a label like &quot;12 questions × 4 engines = 48
          answers&quot; means 48 real conversations, not 48 attempts at fewer questions.
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          An identical question, to the same engine, under the same web-search setting, asked again
          shortly after may reuse that very recent answer instead of placing a fresh call — this
          only applies to a byte-identical repeat, and a web-searched answer is reused for a shorter
          time than a memory-only one, since it can go stale faster.
        </p>
        <p className="text-sm text-muted-foreground">
          A brand&apos;s suburb or city is only passed to an engine once it&apos;s been confirmed —
          and not every engine supports it: Gemini&apos;s search tool has no location-targeting
          option at all, and even where location is passed, there&apos;s no guarantee an engine
          treats it as a hard filter rather than light context.
        </p>
      </section>

      {/* 16 Nov (Sri): how Google is checked, said only while the global setting has Google on for Growth and up
          (components/domain/google-ai: loadGoogleAiClaim, GoogleAiClaim). It was said whenever the env switch was on,
          even with the global setting off. */}
      <GoogleAiClaim googleAi={googleAi}>
        {(g) => <GoogleAiMethodology googleAi={g} />}
      </GoogleAiClaim>

      {/* "Mention detection" (6 Nov), part 6: methodology version 3. Its label is lib/llm/methodology.ts's
          methodologyLabel(3), never spelled out here. */}
      <section className="rounded-xl border p-5 mb-10 bg-muted/30" data-methodology-changes>
        <h2 className="font-semibold mb-2">What changed</h2>
        {/* 20 Nov (Sri's decision): the Technical score's scoring version 4 (lib/technical-audit/scoring-version.ts), with
            its sources (lib/methodology/verified-citations.ts TECHNICAL_SCORING_SOURCES). The Visibility score is not
            touched by it, and the entry says so. */}
        <p className="text-sm text-muted-foreground mb-2" data-methodology-scoring-20nov="">
          <strong>{"20 November 2026: Technical score updated."}</strong>{" "}
          {"llms.txt and ai.txt no longer count toward the Technical score. llms.txt is a "}
          <a
            href={TECHNICAL_SCORING_SOURCES.llmsTxt.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {"proposal"}
          </a>
          {" that no AI provider has said its engine reads; the only document for ai.txt is an "}
          <a
            href={TECHNICAL_SCORING_SOURCES.aiTxtDraft.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {"individual Internet-Draft"}
          </a>
          {" the IETF hasn't endorsed; and Google "}
          <a
            href={TECHNICAL_SCORING_SOURCES.googleAiFeatures.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {"says"}
          </a>
          {` its AI features need no special AI text files. We still check for both and show what we find. robots.txt is now scored on the search crawlers that put a site in AI answers (${searchCrawlerList}), not the training crawlers: blocking GPTBot, ClaudeBot or Google-Extended is your choice and costs nothing. A new Technical Audit is out of ${TECHNICAL_AUDIT_MAX_SCORE}, and it's compared only with audits scored the same way: where an older score meets a newer one, both are shown, with "Scoring updated on" the date of the first new one. Your Visibility score isn't affected.`}
        </p>
        {/* Methodology v2.2 (Sri's decision, 7 Nov): version 4, labelled by methodologyLabel(4). One change
            covering the Gemini model, the answer length limit and comparing like with like. */}
        {/* 19 Nov (Sri's review): which Gemini model answers, and Google's date only as its deprecations page lists it
            (re-opened 19 Nov: gemini-2.5-flash, shutdown "December 1, 2026", recommended replacement
            gemini-3.5-flash-lite; "No shutdown date announced" is the next row's, gemini-2.5-flash-lite). "Every engine's
            answer can now run to 8,192 tokens" was jargon: the limit (lib/llm/output-limit.ts) is well past the longest
            answers measured, so no answer is cut short -- and none was before either, so not "no longer". */}
        <p className="text-sm text-muted-foreground mb-2" data-methodology-v22>
          <strong>November 2026: detection updated — {methodologyLabel(4)}.</strong>{" "}
          {
            "Gemini's answers now come from Gemini 3.5 Flash-Lite (Google lists 1 December 2026 as Gemini 2.5 Flash's shutdown date on its "
          }
          <a
            href={GEMINI_DEPRECATIONS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            deprecations page
          </a>
          {
            "). Answers aren't cut short: each engine may write well past the longest answer we've measured. And an audit is compared only with audits that asked the same engines for the same models: a plan change that moves Claude from Haiku to Sonnet, or an engine answering with a different model than the one we asked for, is shown in your trends but never compared."
          }
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          Audits from before this change are still shown in your trends, marked &quot;Detection
          updated on&quot; the date of your first audit after it, but they&apos;re never compared
          with the ones after.
        </p>
        <p className="text-sm text-muted-foreground mb-2">
          <strong>November 2026: detection improved — {methodologyLabel(3)}.</strong> We now find
          your name when an answer writes it with formatting or invisible characters around it (for
          example in bold, or with a non-breaking hyphen), and keep text written before and after a
          web search apart. An answer the engine didn't finish, or that its own filter stopped, is
          no longer scored. A mention is confirmed by your website only when the answer cited it,
          not when it merely came up in a search.
        </p>
        <p className="text-sm text-muted-foreground">
          Because this can find mentions the earlier detection missed, audits from before the change
          are still shown in your trends, marked &quot;Detection improved on&quot; the date of your
          first audit after it, but they&apos;re never compared with the ones after.
        </p>
        {/* Fair competitor counting (7 Nov): share of voice is worked out from the stored answers
            each time it's shown, so this applies to every audit from that date, with no new
            methodology version. */}
        <p className="text-sm text-muted-foreground mt-2" data-sov-verified-note>
          <strong>
            From 7 November 2026, share of voice uses verified mentions on both sides.
          </strong>{" "}
          Yours count when verified, as in Visibility; a competitor&apos;s count only when its own
          website, set in brand settings, is among the sources the answer cited. A competitor with
          no website set is left out of the share, and named, rather than counted on its name alone.
          Share of voice is worked out from the stored answers each time it&apos;s shown, so this
          applies to earlier audits too.
        </p>
      </section>

      <div className="space-y-4 mb-10">
        {top10.map((m) => (
          <div key={m.id} className="rounded-xl border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{m.description}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block rounded-full bg-primary/10 text-primary text-sm font-semibold px-3 py-1">
                  {m.effectSizeDelta}
                </span>
              </div>
            </div>
            <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-2 py-0.5">Effort: {m.effort}</span>
              <span className="rounded bg-muted px-2 py-0.5">
                {m.citationUrl ? (
                  <a
                    href={m.citationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {m.citation}
                  </a>
                ) : (
                  m.citation
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {remaining.length > 0 && <MethodologyContent remaining={remaining} total={total} />}

      {/* Task GGG: honest provenance for the AI Discovery technical check. 19 Nov (Sri's review): the IETF draft exists
          (datatracker.ietf.org, draft-car-ai-txt-wellknown-00, 12 June 2026) but is an individual Internet-Draft "not
          endorsed by the IETF", so it isn't "an external standard". The three /ai/ files are Vunnara's own format, read
          by no AI engine we know of: they no longer count toward any score (lib/ai-discovery/endpoints.ts). llms.txt is
          a proposal (llmstxt.org, Jeremy Howard, Sept 2024) no AI provider has said it reads, and Google's AI features
          page says no AI text files are needed. */}
      <section className="mt-16 border-t pt-10" data-methodology-ai-discovery="">
        <h2 className="text-xl font-bold mb-4">AI Discovery Endpoints</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          {
            "Our Technical Audit also looks for four files a site can publish for AI tools. None is a standard that an AI engine is known to read, so treat them as optional."
          }
        </p>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">
              <a
                href="https://datatracker.ietf.org/doc/html/draft-car-ai-txt-wellknown-00"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                /.well-known/ai.txt (or root /ai.txt)
              </a>
            </strong>{" "}
            {
              "— A proposal, not a standard: the individual Internet-Draft draft-car-ai-txt-wellknown-00 (not endorsed by the IETF) describes an AI usage-preferences file at /.well-known/ai.txt; the older Spawning convention uses root /ai.txt. We check both and show what we find. From 20 November 2026 it doesn't count toward any score."
            }
          </li>
          <li>
            <strong className="text-foreground">
              /ai/summary.json, /ai/faq.json, /ai/service.json
            </strong>{" "}
            {`— ${OPTIONAL_AI_FILES_LABEL}: Vunnara's own format for a business summary, FAQ content and a service feed. We show whether you have them, but they don't count toward any score, and no task asks you to add them.`}
          </li>
          <li>
            <strong className="text-foreground">
              <a
                href="https://llmstxt.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                /llms.txt
              </a>
            </strong>{" "}
            {
              "— A proposed summary of a site for language models. We check for it and can draft one for you. No AI provider has said its engine reads it, and Google says its AI features need no special AI text files, so from 20 November 2026 it doesn't count toward any score."
            }
          </li>
        </ul>
      </section>

      {/* Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2: how crawler access is checked, as it is -- every
          request as us, robots.txt read per crawler, and no CDN test that would mean pretending to be one. 19 Nov (Sri's
          review): Google-Extended was listed as a crawler. It's a robots.txt token with no crawler of its own, and
          Googlebot's rules are what control AI Overviews and AI Mode; the search and answer agents each company
          documents are read too (lib/robots-txt/evaluate.ts AI_CRAWLERS_CHECKED, with the links). */}
      <section className="mt-16 border-t pt-10" id="ai-crawler-access">
        <h2 className="text-xl font-bold mb-4">AI Crawler Access</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Who we say we are.</strong>{" "}
            {`Every request ${PRODUCT_NAME} makes to your site identifies itself as `}
            <code>{CRAWLER_USER_AGENT}</code>
            {
              ". We never send another company's crawler name, so your logs and blocks never blame OpenAI, Anthropic, Google or Perplexity for our visits."
            }
          </li>
          <li>
            <strong className="text-foreground">robots.txt.</strong>{" "}
            {`For each AI crawler and agent (${crawlerList}) we read the rules your robots.txt sets for it, as RFC 9309 defines them, and say what they mean: "robots.txt allows GPTBot", "robots.txt blocks ClaudeBot", or that it has no rules for that crawler. Blocking a training crawler (GPTBot, ClaudeBot) keeps your pages out of future training; whether they appear in an assistant's web-search answers is up to its search crawler (OAI-SearchBot, Claude-SearchBot). OpenAI and Perplexity say robots.txt may not stop ChatGPT-User and Perplexity-User, which fetch a page when someone asks. The Technical score's robots.txt check counts only the search crawlers (${searchCrawlerList}): blocking one costs points and makes a task, and blocking a training crawler or Google-Extended costs nothing.`}
          </li>
          <li>
            <strong className="text-foreground">Google-Extended.</strong>{" "}
            {
              "Google-Extended isn't a crawler that visits: it's a robots.txt setting Google reads to decide whether your pages may train Gemini and ground its answers. Google crawls with its usual crawlers, and AI Overviews and AI Mode draw on Googlebot, so allowing Google-Extended doesn't get a site into them and blocking it doesn't keep a site out. We report what your robots.txt sets for it, never visits from it."
            }
          </li>
          <li>
            <strong className="text-foreground">CDNs and firewalls.</strong>{" "}
            {`Whether yours lets an AI crawler through ${CANT_TEST_FROM_OUTSIDE} without pretending to be it, so we don't. Your own server logs, uploaded to ${PRODUCT_NAME}, show each crawler's real visits, each checked against the company's published IP ranges or reverse DNS; CDN Shield reports those verified visits beside what robots.txt says.`}
          </li>
        </ul>
      </section>

      <section className="mt-16 border-t pt-10">
        <h2 className="text-xl font-bold mb-4">Research Citations</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          {RESEARCH_SOURCES.map((src) => (
            <li key={src.name}>
              <strong className="text-foreground">
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {src.name}
                </a>
              </strong>{" "}
              — {src.description}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
