export function TrustBadges() {
  // 9 Nov (retention follow-ups, part 2): "Prompt data deleted within 24h" was untrue. An audit's questions and
  // answers are kept 12 months, the evidence archive until asked, and even the free sample audit is deleted by a
  // daily job a day after it runs (so up to two days). No badge can say that honestly; the privacy page does.
  const badges = [
    { icon: "🔒", text: "SSL encrypted" },
    { icon: "🇦🇺", text: "Australian Privacy Act 1988 compliant" },
    { icon: "💳", text: "No credit card for free plan" },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-4 mt-2 mb-8 px-6">
      {badges.map((b) => (
        <div key={b.text} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{b.icon}</span>
          <span>{b.text}</span>
        </div>
      ))}
    </div>
  );
}
