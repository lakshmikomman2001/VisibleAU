import type { Brand } from "@/db/schema";

interface ExpandContext {
  brand: Pick<Brand, "name" | "domain">;
  competitors: string[];
  locations: string[];
}

export function formatLocation(raw: string): string {
  const [state, suburb] = raw.split(":");
  if (!suburb) return raw;
  return `${suburb}, ${state}`;
}

export function formatCompetitors(competitors: string[]): string {
  if (competitors.length === 0) return "other local providers";
  return competitors.join(", ");
}

export function expandPrompt(template: string, ctx: ExpandContext): string[] {
  const formattedLocations = ctx.locations.map(formatLocation);
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
