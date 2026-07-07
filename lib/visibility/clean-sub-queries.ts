export function cleanSubQueries(raw: string, max: number): string[] {
  return raw
    .split("\n")
    .map(l => l.trim())
    .map(l => l.replace(/^\s*\d+[.)]\s*/, ""))
    .map(l => l.replace(/^\s*[-*•]\s*/, ""))
    .map(l => l.replace(/\*\*/g, "").replace(/^#+\s*/, ""))
    .map(l => l.replace(/^["'`]|["'`]$/g, "").trim())
    .filter(Boolean)
    .filter(l => !/^-{2,}$/.test(l))
    .filter(l => !/^(certainly|here are|sure|below are|these are|of course)\b/i.test(l))
    .filter(l => l.length >= 3 && l.length <= 120)
    .filter(l => !l.endsWith(":"))
    .slice(0, max);
}
