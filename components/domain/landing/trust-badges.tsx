export function TrustBadges() {
  const badges = [
    { icon: "🔒", text: "SSL encrypted" },
    { icon: "🇦🇺", text: "Australian Privacy Act 1988 compliant" },
    { icon: "🗑️", text: "Prompt data deleted within 24h" },
    { icon: "💳", text: "No credit card for free plan" },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-4 mt-2 mb-8 px-6">
      {badges.map((b) => (
        <div
          key={b.text}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span>{b.icon}</span>
          <span>{b.text}</span>
        </div>
      ))}
    </div>
  );
}
