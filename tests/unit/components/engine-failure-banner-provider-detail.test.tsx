/**
 * S02 part 0B (LLD amendment 71): the audit page's engine banner. Everyone sees the plain line ("Why: a problem on our
 * side."); a platform admin (the existing check, lib/auth/platform-admin.ts) also sees the provider detail under it --
 * the operator's label and what to check -- which S01C had taken off the page for everyone.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EngineTotalFailureBanner } from "@/components/domain/audit/engine-failure-banner";
import { describeEngineFailure } from "@/lib/audit/engine-failure";

const reason = describeEngineFailure({
  errorClass: "APICallError",
  message: "400 You have reached your specified API usage limits.",
});
const props = {
  failedEngines: [{ engine: "claude", reason }],
  questionCount: 13,
  enginesAsked: 4,
  answerCount: 30,
};

describe("the engine banner's provider detail", () => {
  it("everyone else: the plain line only", () => {
    const html = renderToStaticMarkup(<EngineTotalFailureBanner {...props} />);
    expect(html).toContain("Why: a problem on our side.");
    expect(html).not.toContain("data-engine-failure-provider-detail");
    expect(html).not.toContain(reason.label);
  });

  it("a platform admin: the plain line, then the provider's detail under it", () => {
    const html = renderToStaticMarkup(<EngineTotalFailureBanner {...props} showProviderDetail />);
    const plain = html.indexOf("Why: a problem on our side.");
    const detail = html.indexOf("data-engine-failure-provider-detail");
    expect(plain).toBeGreaterThan(-1);
    expect(detail).toBeGreaterThan(plain);
    expect(reason.label).toMatch(/spend limit/i);
    expect(html).toContain(`Claude: ${reason.label.replace(/'/g, "&#x27;")}`);
  });
});
