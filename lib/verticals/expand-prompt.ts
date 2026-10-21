import type { Brand } from "@/db/schema";
import { validateGeneratedQuestion } from "@/lib/prompts/validate-question";

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
  const formattedCompetitors = formatCompetitors(ctx.competitors);

  if (template.includes("{location}")) {
    if (ctx.locations.length === 0) return [];
    const results: string[] = [];
    for (const rawLocation of ctx.locations) {
      const formattedLoc = formatLocation(rawLocation);
      const text = template
        .replace(/\{brand\}/g, ctx.brand.name)
        .replace(/\{domain\}/g, ctx.brand.domain)
        .replace(/\{location\}/g, formattedLoc)
        .replace(/\{competitors\}/g, formattedCompetitors);
      // Reliability follow-up, item 4: a FREE-TEXT suburb (the
      // sample's new "my suburb isn't listed" input, or any uncurated
      // real-brand suburb typed at the wizard) can combine with a
      // template in a way a curated AU_LOCATIONS entry never could --
      // run every {location}-templated question through the same
      // validator the classified-brand path already relies on
      // (lib/prompts/validate-question.ts), and silently drop a
      // malformed result rather than ask a visitor a broken question.
      // A curated location's own text always passes this -- it was
      // already proven not to double/misplace itself.
      if (validateGeneratedQuestion(text, formattedLoc, true).valid) {
        results.push(text);
      }
    }
    return results;
  }

  return [
    template
      .replace(/\{brand\}/g, ctx.brand.name)
      .replace(/\{domain\}/g, ctx.brand.domain)
      .replace(/\{competitors\}/g, formattedCompetitors),
  ];
}
