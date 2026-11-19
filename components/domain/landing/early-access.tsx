/**
 * 19 Nov (Sri's review): the landing page's early-access call. It was "Trusted by early adopters", with a
 * testimonials grid ("What our customers say") ready for quotes -- social proof there's none of yet: no customers, no
 * quotes. So it's what it is, early access, with no quote grid to fill.
 */
export function EarlyAccess() {
  return (
    <section className="py-20 text-center px-6" data-landing-early-access="">
      <h2 className="text-3xl font-bold mb-4">Early access</h2>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        We&apos;re in early access. Join and help shape how AI search visibility is measured for
        Australian businesses.
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
