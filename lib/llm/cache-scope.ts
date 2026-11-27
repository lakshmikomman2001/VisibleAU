/**
 * S04 part 4 (LLD 8.4.4): setCached's scope argument, only when the call has one (a question beyond Local) -- a Local
 * question's cache calls stay exactly what they were. Its own module: tests mock lib/llm/cache.ts whole.
 */
export function cacheScopeArg(input: { cacheScope?: string }): [] | [string] {
  return input.cacheScope ? [input.cacheScope] : [];
}
