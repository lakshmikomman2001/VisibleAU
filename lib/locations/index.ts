/**
 * Vunnara Build 1, Part D: curated AU locations only (no open
 * geocoding) -- `city`/`state` are explicit, never derived from
 * `label`, so a prompt can read "Bondi" for the suburb step and
 * "Sydney" for the city-fallback step without string-parsing a label
 * meant for display. Every entry's city/state is checked by a test
 * (tests/unit/locations/index.test.ts).
 */
export interface AuLocation {
  value: string;
  label: string;
  city: string;
  state: string;
}

export const AU_LOCATIONS: AuLocation[] = [
  { value: "NSW:Sydney CBD", label: "Sydney CBD, NSW", city: "Sydney", state: "NSW" },
  { value: "NSW:Bondi", label: "Bondi, NSW", city: "Sydney", state: "NSW" },
  { value: "NSW:Parramatta", label: "Parramatta, NSW", city: "Sydney", state: "NSW" },
  { value: "NSW:Chatswood", label: "Chatswood, NSW", city: "Sydney", state: "NSW" },
  { value: "NSW:Newtown", label: "Newtown, NSW", city: "Sydney", state: "NSW" },
  { value: "NSW:North Sydney", label: "North Sydney, NSW", city: "Sydney", state: "NSW" },
  { value: "NSW:Manly", label: "Manly, NSW", city: "Sydney", state: "NSW" },
  { value: "NSW:Surry Hills", label: "Surry Hills, NSW", city: "Sydney", state: "NSW" },
  { value: "VIC:Melbourne CBD", label: "Melbourne CBD, VIC", city: "Melbourne", state: "VIC" },
  { value: "VIC:Fitzroy", label: "Fitzroy, VIC", city: "Melbourne", state: "VIC" },
  { value: "VIC:Richmond", label: "Richmond, VIC", city: "Melbourne", state: "VIC" },
  { value: "VIC:St Kilda", label: "St Kilda, VIC", city: "Melbourne", state: "VIC" },
  { value: "VIC:South Yarra", label: "South Yarra, VIC", city: "Melbourne", state: "VIC" },
  { value: "QLD:Brisbane CBD", label: "Brisbane CBD, QLD", city: "Brisbane", state: "QLD" },
  { value: "QLD:Gold Coast", label: "Gold Coast, QLD", city: "Gold Coast", state: "QLD" },
  { value: "QLD:Sunshine Coast", label: "Sunshine Coast, QLD", city: "Sunshine Coast", state: "QLD" },
  { value: "WA:Perth CBD", label: "Perth CBD, WA", city: "Perth", state: "WA" },
  { value: "WA:Fremantle", label: "Fremantle, WA", city: "Perth", state: "WA" },
  { value: "SA:Adelaide CBD", label: "Adelaide CBD, SA", city: "Adelaide", state: "SA" },
  { value: "ACT:Canberra CBD", label: "Canberra CBD, ACT", city: "Canberra", state: "ACT" },
];

export function searchLocations(query: string): AuLocation[] {
  const q = query.toLowerCase();
  return AU_LOCATIONS.filter((l) => l.label.toLowerCase().includes(q)).slice(0, 10);
}

/** Look up a location's city/state by its stored "STATE:Suburb" value. */
export function findLocation(value: string): AuLocation | null {
  return AU_LOCATIONS.find((l) => l.value === value) ?? null;
}

/**
 * The one place a confirmed suburb's CITY gets derived -- the curated
 * list's real city, or NULL (unknown) when the suburb isn't curated.
 * Vunnara hotfix (18 Oct, post-df27ef8): the wizard and the location-
 * confirm card used to each inline their own `findLocation(entry)?.city
 * ?? <the suburb itself>` -- inventing a city (a suburb is not a city)
 * for every suburb outside this short curated list. "Norwest" (a real
 * NSW suburb, just not curated here yet) is the live case that
 * surfaced this: it was saved as its own city. NULL is the honest
 * value until Build 2's full ABS suburb-to-city dataset lands --
 * never a guess.
 */
export function resolveCityForSuburb(entry: string): string | null {
  return findLocation(entry)?.city ?? null;
}

/**
 * The single "STATE:Suburb" entry format, shared by the wizard
 * (app/(auth)/brands/wizard/wizard-form.tsx) and the existing-brand
 * location-confirmation card (components/domain/brand/location-
 * confirm-card.tsx) -- one validator, not two copies that can drift.
 */
export const SUBURB_ENTRY_REGEX = /^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/;

export function isValidSuburbEntry(entry: string): boolean {
  return SUBURB_ENTRY_REGEX.test(entry);
}
