export function Hero() {
  return (
    <section className="relative overflow-hidden py-24 text-center px-6">
      <span className="inline-block rounded-full bg-primary/10 text-primary text-xs font-medium px-3 py-1">
        Built for Australian SMBs
      </span>
      <h1 className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto">
        See your brand in ChatGPT, Claude, Gemini, and Perplexity
      </h1>
      <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
        Get an honest read on how AI search engines describe your business.
        Built for Australian SMBs.
      </p>
      <div className="mt-8 flex justify-center gap-3 flex-wrap">
        <a
          href="/sample-audit"
          className="rounded-md bg-primary px-6 py-3 text-primary-foreground font-medium text-sm"
        >
          Try a free sample audit
        </a>
        <a
          href="/pricing"
          className="rounded-md border px-6 py-3 text-sm font-medium hover:bg-muted transition-colors"
        >
          See pricing
        </a>
      </div>
    </section>
  );
}
