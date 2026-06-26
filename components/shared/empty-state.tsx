import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      {Icon && <Icon className="w-10 h-10 text-muted-foreground" />}
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      {cta && (
        <a
          href={cta.href}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground font-medium"
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}
