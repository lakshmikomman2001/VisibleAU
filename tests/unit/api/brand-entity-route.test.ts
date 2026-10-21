import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => {
  const mockDb = { select: vi.fn() };
  return {
    db: mockDb,
    withRlsContext: vi.fn(async (_orgId: string, fn: (tx: unknown) => unknown) => fn(mockDb)),
  };
});

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  brands: { id: "id", organizationId: "organization_id", deletedAt: "deleted_at" },
  brandEntityScores: { brandId: "brand_id", checkedAt: "checked_at" },
}));

import { GET } from "@/app/api/brand-entity/[brandId]/route";
import { db } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockSelect = vi.mocked(db.select);

const BRAND_ID = "4e0a8e9a-6b1a-4b1a-9b1a-6b1a4b1a9b1a";

// Each link is both further-chainable AND directly awaitable (has its
// own `.then`) -- the route's brand lookup resolves straight off
// `.where(...)` with no `.orderBy()/.limit()`, while the entity-score
// lookup chains both on; one mock shape has to serve both call sites.
function setupSelectChain(results: unknown[][]) {
  let call = 0;
  function chain(): unknown {
    const result = results[call] ?? [];
    return {
      from: () => chain(),
      where: () => chain(),
      orderBy: () => chain(),
      limit: () => {
        call++;
        return Promise.resolve(result);
      },
      then: (resolve: (v: unknown[]) => void) => {
        call++;
        return Promise.resolve(result).then(resolve);
      },
    };
  }
  mockSelect.mockImplementation(() => chain() as never);
}

async function callGet(brandId: string) {
  const req = new Request(`http://localhost/api/brand-entity/${brandId}`);
  return GET(req, { params: Promise.resolve({ brandId }) });
}

describe("GET /api/brand-entity/[brandId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      organizationId: "org-1",
    } as never);
  });

  // Sri, 21 Oct follow-up, item 4: this route was found returning the
  // raw brand_entity_scores row unmodified (NextResponse.json(latest))
  // -- its sibling (entity-score/route.ts) already nulled
  // auDirectoryPresence out, but this one didn't, so a caller of THIS
  // route still saw whatever the now-deleted, untrustworthy directory
  // checker last wrote (`[]` after 0085's fix, or a real-looking array
  // before it).
  it("never returns a real auDirectoryPresence value, even one sitting in the row", async () => {
    setupSelectChain([
      [{ id: BRAND_ID, name: "Test Brand" }],
      [
        {
          id: "score-1",
          brandId: BRAND_ID,
          auDirectoryPresence: [{ name: "hipages", present: true, url: "https://hipages.com.au/x" }],
          abnVerified: true,
          wikipediaAuPresent: false,
          auTldPresent: true,
          scoreOf10: "9.00",
        },
      ],
    ]);

    const res = await callGet(BRAND_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auDirectoryPresence).toBeNull();
  });

  // Sri, 21 Oct follow-up, item 5: displayScore is the recomputed,
  // always-correct percentage (lib/brand-entity/score.ts) -- the raw
  // scoreOf10 is left in the response as a diagnostic value, but it is
  // never what a caller should compute a percentage from (a pre-hotfix
  // row's scoreOf10 ran up to 10, not 8).
  it("includes a recomputed displayScore from the row's own abn/wikipedia/auTld facts, not from scoreOf10", async () => {
    setupSelectChain([
      [{ id: BRAND_ID, name: "Test Brand" }],
      [
        {
          id: "score-1",
          brandId: BRAND_ID,
          auDirectoryPresence: [],
          abnVerified: true,
          wikipediaAuPresent: true,
          auTldPresent: false,
          // A deliberately stale/inconsistent scoreOf10 (as a pre-hotfix
          // row, computed under the old weights, legitimately could be) --
          // displayScore must come from the booleans above (75), never
          // from this number.
          scoreOf10: "9.00",
        },
      ],
    ]);

    const res = await callGet(BRAND_ID);
    const body = await res.json();
    expect(body.displayScore).toBe(75);
    expect(body.scoreOf10).toBe("9.00"); // left in place as a raw diagnostic
  });

  it("404s when the brand has no entity score row at all", async () => {
    setupSelectChain([[{ id: BRAND_ID, name: "Test Brand" }], []]);
    const res = await callGet(BRAND_ID);
    expect(res.status).toBe(404);
  });

  it("404s when the brand doesn't belong to the caller's org (or doesn't exist)", async () => {
    setupSelectChain([[]]);
    const res = await callGet(BRAND_ID);
    expect(res.status).toBe(404);
  });

  it("401s when there is no authenticated user", async () => {
    mockGetCurrentUser.mockResolvedValue(null as never);
    const res = await callGet(BRAND_ID);
    expect(res.status).toBe(401);
  });
});
