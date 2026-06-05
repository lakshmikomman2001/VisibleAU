export const AU_LOCATIONS: { value: string; label: string }[] = [
  { value: "NSW:Sydney CBD", label: "Sydney CBD, NSW" },
  { value: "NSW:Bondi", label: "Bondi, NSW" },
  { value: "NSW:Parramatta", label: "Parramatta, NSW" },
  { value: "NSW:Chatswood", label: "Chatswood, NSW" },
  { value: "NSW:Newtown", label: "Newtown, NSW" },
  { value: "NSW:North Sydney", label: "North Sydney, NSW" },
  { value: "NSW:Manly", label: "Manly, NSW" },
  { value: "NSW:Surry Hills", label: "Surry Hills, NSW" },
  { value: "VIC:Melbourne CBD", label: "Melbourne CBD, VIC" },
  { value: "VIC:Fitzroy", label: "Fitzroy, VIC" },
  { value: "VIC:Richmond", label: "Richmond, VIC" },
  { value: "VIC:St Kilda", label: "St Kilda, VIC" },
  { value: "VIC:South Yarra", label: "South Yarra, VIC" },
  { value: "QLD:Brisbane CBD", label: "Brisbane CBD, QLD" },
  { value: "QLD:Gold Coast", label: "Gold Coast, QLD" },
  { value: "QLD:Sunshine Coast", label: "Sunshine Coast, QLD" },
  { value: "WA:Perth CBD", label: "Perth CBD, WA" },
  { value: "WA:Fremantle", label: "Fremantle, WA" },
  { value: "SA:Adelaide CBD", label: "Adelaide CBD, SA" },
  { value: "ACT:Canberra CBD", label: "Canberra CBD, ACT" },
];

export function searchLocations(query: string): typeof AU_LOCATIONS {
  const q = query.toLowerCase();
  return AU_LOCATIONS.filter((l) => l.label.toLowerCase().includes(q)).slice(0, 10);
}
