/**
 * The landing page's row of facts under the hero.
 * - 9 Nov (retention follow-ups, part 2): "Prompt data deleted within 24h" was untrue. An audit's questions and
 *   answers are kept 12 months, the evidence archive until asked, and even the free sample audit is deleted by a
 *   daily job a day after it runs (so up to two days). No badge can say that honestly; the privacy page does.
 * - 19 Nov (Sri's review): "Australian Privacy Act 1988 compliant" was a legal claim nobody has checked; it's a link
 *   to the privacy policy now. "No credit card for free plan" only where there's a Free plan (`showFreeTier`, the
 *   same switch as /pricing's Free card: lib/feature-flags isFreeTierEnabled).
 */
export function TrustBadges({ showFreeTier }: { showFreeTier: boolean }) {
  const badges: { icon: string; text: string; href?: string }[] = [
    { icon: "🔒", text: "SSL encrypted" },
    { icon: "📄", text: "Privacy policy", href: "/privacy" },
    ...(showFreeTier ? [{ icon: "💳", text: "No credit card for free plan" }] : []),
  ];

  return (
    <div className="flex flex-wrap justify-center gap-4 mt-2 mb-8 px-6" data-landing-trust="">
      {badges.map((b) => (
        <div key={b.text} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true">{b.icon}</span>
          {b.href ? (
            <a href={b.href} className="underline hover:text-foreground">
              {b.text}
            </a>
          ) : (
            <span>{b.text}</span>
          )}
        </div>
      ))}
    </div>
  );
}
