import type { Brand } from "@/db/schema";

interface ExpandContext {
  brand: Pick<Brand, "name" | "domain">;
  competitors: string[];
  locations: string[];
}

export function formatLocation(raw: string | null | undefined, fallback = "—"): string {
  if (!raw) return fallback;
  const parts = raw.split(":");
  if (parts.length === 1) return raw;
  const state = parts[0].toUpperCase();
  const suburb = parts[parts.length - 1];
  if (!suburb) return fallback;
  const capitalizedSuburb = suburb.charAt(0).toUpperCase() + suburb.slice(1);
  return `${capitalizedSuburb}, ${state}`;
}

export function formatCompetitors(competitors: string[]): string {
  if (competitors.length === 0) return "other local providers";
  return competitors.join(", ");
}

export function expandPrompt(template: string, ctx: ExpandContext): string[] {
  const formattedLocations = ctx.locations.map((loc) => formatLocation(loc));
  const formattedCompetitors = formatCompetitors(ctx.competitors);

  if (template.includes("{location}")) {
    if (formattedLocations.length === 0) return [];
    return formattedLocations.map((loc) =>
      template
        .replace(/\{brand\}/g, ctx.brand.name)
        .replace(/\{domain\}/g, ctx.brand.domain)
        .replace(/\{location\}/g, loc)
        .replace(/\{competitors\}/g, formattedCompetitors),
    );
  }

  return [
    template
      .replace(/\{brand\}/g, ctx.brand.name)
      .replace(/\{domain\}/g, ctx.brand.domain)
      .replace(/\{competitors\}/g, formattedCompetitors),
  ];
}
