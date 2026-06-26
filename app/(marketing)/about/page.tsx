import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata({ title: "About", path: "/about" });
}

export default function AboutPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-6">About VisibleAU</h1>
      <div className="space-y-4 text-muted-foreground">
        <p>
          VisibleAU helps Australian service businesses understand how AI search
          engines describe them when customers ask questions like &ldquo;best
          plumber in Bondi&rdquo; or &ldquo;recommend a physio in
          Melbourne.&rdquo;
        </p>
        <p>
          We audit your brand&apos;s visibility across ChatGPT, Claude, Gemini,
          and Perplexity — measuring frequency, position, sentiment, context,
          and accuracy of every mention. Then we give you specific
          recommendations to improve.
        </p>
        <p>
          Built by an indie developer in Sydney. Questions?{" "}
          <a href="mailto:hi@visibleau.com" className="underline text-primary">
            hi@visibleau.com
          </a>
        </p>
      </div>
    </article>
  );
}
