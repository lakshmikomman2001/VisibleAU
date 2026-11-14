import { describe, expect, it } from "vitest";
import { buildMetadata } from "@/lib/seo/metadata";

describe("F02: SEO metadata helper", () => {
  it("F02-01: returns title with site name suffix", () => {
    const meta = buildMetadata({ title: "Pricing", path: "/pricing" });
    expect(meta.title.absolute).toBe("Pricing | Vunnara");
  });

  it("F02-02: returns description when provided", () => {
    const meta = buildMetadata({
      title: "About",
      path: "/about",
      description: "Learn about Vunnara",
    });
    expect(meta.description).toBe("Learn about Vunnara");
  });

  it("F02-03: includes openGraph metadata", () => {
    const meta = buildMetadata({ title: "Pricing", path: "/pricing" });
    expect(meta.openGraph).toBeDefined();
  });

  it("F02-04: works without optional description", () => {
    const meta = buildMetadata({ title: "Terms", path: "/terms" });
    expect(meta.title.absolute).toBeTruthy();
  });
});
