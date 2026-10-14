/**
 * Task #46 (15th follow-up), Part C: several Inngest functions triggered by
 * `audit.complete` (and a couple of other events) accepted an
 * organizationId/brandId directly on the event payload and preferred it
 * over the value actually on the row the function itself loaded --
 * `const bId = eventBrandId ?? current.brandId`. "Single trusted sender"
 * is not a property the TYPE SYSTEM enforces -- it held for every sender
 * checked in this follow-up, but `generate-content-draft.ts`'s taskId (the
 * 14th follow-up's concrete fix) shows exactly how it can stop holding
 * without anyone noticing, the moment a new caller forwards request input
 * into an event payload without the same care the original sender had.
 *
 * `loadScopedOrAbort()` is the fix, extracted once so new Inngest
 * functions follow the same pattern instead of each re-deriving it: load
 * the entity by its own id, and treat the row's own organization_id/
 * brand_id as the only truth -- never the event payload's. If the payload
 * also claims an org/brand AND it disagrees with what's actually on the
 * row, that's not "trust the row anyway" (a payload that wrong might mean
 * a bug upstream, not just excess caution) -- it logs
 * `inngest_scope_mismatch` at error level and aborts with no further
 * reads or writes, exactly like a not-found row.
 */
export interface ScopedEntity {
  organizationId: string;
  brandId?: string | null;
}

export interface LoadScopedOrAbortOptions<T extends ScopedEntity> {
  /** The Inngest function's own id, for the log line -- never user input. */
  fn: string;
  /** The id of the row being loaded, for the log line. */
  entityId: string;
  /** Loads the entity by its own id; undefined/null means "not found". */
  load: () => Promise<T | null | undefined>;
  /** The event payload's claimed organizationId, if it sends one at all. */
  eventOrganizationId?: string | null;
  /** The event payload's claimed brandId, if it sends one at all. */
  eventBrandId?: string | null;
}

export async function loadScopedOrAbort<T extends ScopedEntity>(
  opts: LoadScopedOrAbortOptions<T>,
): Promise<T | null> {
  const row = await opts.load();
  if (!row) return null;

  const orgMismatch =
    opts.eventOrganizationId != null && opts.eventOrganizationId !== row.organizationId;
  const brandMismatch =
    opts.eventBrandId != null && row.brandId != null && opts.eventBrandId !== row.brandId;

  if (orgMismatch || brandMismatch) {
    console.error(
      JSON.stringify({ event: "inngest_scope_mismatch", fn: opts.fn, entityId: opts.entityId }),
    );
    return null;
  }

  return row;
}
