import {
  GOOGLE_AI_LOCATION_TEXT,
  GOOGLE_ONLINE_ONLY_REASON,
  googleAiArrival,
  googleAiSurfacesText,
  type PublicGoogleAi,
} from "@/lib/marketing/google-ai";

/**
 * 16 Nov (Sri) -- the methodology's short section on how Google is checked, from what the audit runs with now
 * (publicGoogleAi): the provider, logged out, the place and the device, when the results arrive, the score, and what
 * "not shown" and "couldn't be checked" mean. Rendered only through GoogleAiClaim, so it's on the page only while the
 * global setting is on. The fallbacks and their label are lib/google-surfaces/location.ts's; the reasons a question
 * couldn't be checked are lib/audit/google-surfaces/reasons.ts's customer reasons.
 */
export function GoogleAiMethodology({ googleAi }: { googleAi: PublicGoogleAi }) {
  const overviews = googleAi.surfaces.includes("google_ai_overviews");
  const mode = googleAi.surfaces.includes("google_ai_mode");
  const what = [
    overviews ? "the AI Overview at the top of the results page (google.com.au)" : null,
    mode ? "an AI Mode answer (Google runs AI Mode on google.com, set to Australia)" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return (
    <section className="rounded-xl border p-5 mb-10 bg-muted/30" data-methodology-google="">
      <h2 className="font-semibold mb-2">Google {googleAiSurfacesText(googleAi.surfaces)}</h2>
      <p className="text-sm text-muted-foreground mb-2">
        On {googleAi.fromPlan} plans and up, each audit also checks what Google shows for the same
        questions: {what}. Google&apos;s results are collected for us by DataForSEO, a search-data
        provider, logged out, so nobody&apos;s search history or personal results are involved.
      </p>
      <p className="text-sm text-muted-foreground mb-2">
        {/* 19 Nov: the place in the comparison table's words (GOOGLE_AI_LOCATION_TEXT), one source. */}
        {`Each result is for one place and one device (${googleAi.device}), checked ${GOOGLE_AI_LOCATION_TEXT} (the audit then says "Results for Sydney NSW, not your suburb"), and never the whole of Australia. Each result is labelled with that place, the device and the date.`}{" "}
        {/* 19 Nov (Sri's review): the reason the audit shows, word for word. */}
        {`A business with no fixed location (online-only) isn't checked on Google; its audit says: "${GOOGLE_ONLINE_ONLY_REASON}"`}
      </p>
      <p className="text-sm text-muted-foreground mb-2">
        Google&apos;s results arrive {googleAiArrival(googleAi)} and are shown in their own section,{" "}
        {googleAi.countedInScore
          ? "counted in the Visibility score."
          : "not counted in the Visibility score."}
      </p>
      {overviews ? (
        <p className="text-sm text-muted-foreground mb-2">
          Google decides, question by question and time to time, whether to show an AI Overview at
          all. &quot;Not shown&quot; means Google showed none for that question when we checked: it
          isn&apos;t a failure, and it isn&apos;t &quot;not mentioned&quot;.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        &quot;Couldn&apos;t be checked&quot; means we got no result from Google for that question
        this time: the checking service was busy or had a problem, Google didn&apos;t answer in
        time, or a spending limit for Google was reached. The question is left out, never counted as
        &quot;not shown&quot; or &quot;not mentioned&quot;, and the next audit asks it again. A
        mention counts only when it&apos;s verified, the same way as for every other engine, and
        Google&apos;s answers vary with time and place, so one audit is a snapshot.
      </p>
    </section>
  );
}
