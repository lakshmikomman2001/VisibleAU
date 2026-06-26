export function Testimonials({
  items,
}: {
  items?: Array<{
    quote: string;
    author: string;
    company: string;
    role: string;
  }>;
}) {
  if (!items || items.length === 0) {
    return (
      <section className="py-20 text-center px-6">
        <h2 className="text-3xl font-bold mb-4">Trusted by early adopters</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          We&apos;re in early access. Join and help shape how AI search
          visibility is measured for Australian businesses.
        </p>
        <a
          href="/sign-up"
          className="rounded-md bg-primary px-6 py-3 text-primary-foreground font-medium text-sm"
        >
          Get early access
        </a>
      </section>
    );
  }

  return (
    <section className="py-20 px-6">
      <h2 className="text-3xl font-bold text-center mb-12">
        What our customers say
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border p-6">
            <p className="text-sm text-muted-foreground mb-4 italic">
              &ldquo;{item.quote}&rdquo;
            </p>
            <p className="text-sm font-semibold">{item.author}</p>
            <p className="text-xs text-muted-foreground">
              {item.role}, {item.company}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
