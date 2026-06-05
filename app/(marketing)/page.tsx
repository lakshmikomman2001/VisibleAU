export default function LandingPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        See how AI search engines talk about your brand
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        VisibleAU audits your visibility across ChatGPT, Claude, Gemini, and Perplexity — with
        AU-specific buyer-prompt intelligence.
      </p>
      <div className="mt-8">
        <a
          href="/sign-up"
          className="rounded-md bg-primary px-6 py-3 text-primary-foreground font-medium"
        >
          Start free audit
        </a>
      </div>
    </div>
  );
}
