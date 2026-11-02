/**
 * 3 Nov ("Logo uploads: limits now, cleanup job dry-run") -- list and delete on
 * both storage drivers, which the upload cap and cleanup-orphan-logos read.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageAdapter } from "@/lib/storage/local-adapter";
import { SupabaseStorageAdapter } from "@/lib/storage/supabase-adapter";

const supabase = vi.hoisted(() => ({
  bucket: "",
  list: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: (bucket: string) => {
        supabase.bucket = bucket;
        return { list: supabase.list, remove: supabase.remove };
      },
    },
  }),
}));

describe("LocalStorageAdapter", () => {
  let dir: string;

  function put(path: string, modified?: Date) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "x");
    if (modified) utimesSync(full, modified, modified);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vunnara-list-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists a folder's files with their whole paths and dates, and its folders", async () => {
    const when = new Date("2026-10-01T00:00:00.000Z");
    put("org/branding/a.png", when);
    put("org/branding/b.jpg", when);
    put("org/branding/nested/c.png", when);
    const listing = await new LocalStorageAdapter(dir).list("org/branding");
    expect(listing.files.map((f) => f.path).sort()).toEqual([
      "org/branding/a.png",
      "org/branding/b.jpg",
    ]);
    expect(listing.files[0].createdAt?.getTime()).toBe(when.getTime());
    expect(listing.folders).toEqual(["org/branding/nested"]);
  });

  it("the top of the store lists its folders", async () => {
    put("org-a/branding/a.png");
    put("org-b/branding/b.png");
    const listing = await new LocalStorageAdapter(dir).list("");
    expect(listing.folders.sort()).toEqual(["org-a", "org-b"]);
    expect(listing.files).toEqual([]);
  });

  it("a folder that doesn't exist is empty, not an error", async () => {
    expect(await new LocalStorageAdapter(dir).list("nowhere/branding")).toEqual({
      files: [],
      folders: [],
    });
  });

  it("deletes what it's told, and a file already gone isn't an error", async () => {
    put("org/branding/a.png");
    put("org/branding/b.png");
    const storage = new LocalStorageAdapter(dir);
    await storage.delete(["org/branding/a.png", "org/branding/gone.png"]);
    const { files } = await storage.list("org/branding");
    expect(files.map((f) => f.path)).toEqual(["org/branding/b.png"]);
  });
});

describe("SupabaseStorageAdapter", () => {
  const CREATED = "2026-10-01T00:00:00.000Z";
  const file = (name: string, created: string | null = CREATED) => ({
    name,
    id: `id-${name}`,
    created_at: created,
    updated_at: created,
    last_accessed_at: created,
    metadata: {},
  });
  const folder = (name: string) => ({
    name,
    id: null,
    created_at: null,
    updated_at: null,
    last_accessed_at: null,
    metadata: null,
  });

  beforeEach(() => {
    supabase.list.mockReset();
    supabase.remove.mockReset();
  });

  it("tells files from folders, in the bucket it was given, with the folder's path", async () => {
    supabase.list.mockResolvedValueOnce({
      data: [file("a.png"), folder("nested"), file("no-date.png", null)],
      error: null,
    });
    const listing = await new SupabaseStorageAdapter("logos").list("org/branding");
    expect(supabase.bucket).toBe("logos");
    expect(supabase.list.mock.calls[0][0]).toBe("org/branding");
    expect(listing.folders).toEqual(["org/branding/nested"]);
    expect(listing.files).toEqual([
      { path: "org/branding/a.png", createdAt: new Date(CREATED) },
      { path: "org/branding/no-date.png", createdAt: null },
    ]);
  });

  it("reads every page: Supabase returns 100 at a time by default", async () => {
    const page = Array.from({ length: 100 }, (_, i) => file(`p1-${i}.png`));
    supabase.list
      .mockResolvedValueOnce({ data: page, error: null })
      .mockResolvedValueOnce({ data: [file("last.png")], error: null });
    const { files } = await new SupabaseStorageAdapter("logos").list("org/branding");
    expect(files).toHaveLength(101);
    expect(supabase.list.mock.calls[1][1]).toMatchObject({ offset: 100 });
  });

  it("stops early when a limit is enough: counting needs no more", async () => {
    const page = Array.from({ length: 100 }, (_, i) => file(`p1-${i}.png`));
    supabase.list.mockResolvedValue({ data: page, error: null });
    const { files } = await new SupabaseStorageAdapter("logos").list("org/branding", { limit: 51 });
    expect(files.length).toBeGreaterThanOrEqual(51);
    expect(supabase.list).toHaveBeenCalledTimes(1);
  });

  it("a failed list throws, without a URL or key in the message", async () => {
    supabase.list.mockResolvedValue({
      data: null,
      error: { message: "bad https://abc.supabase.co/storage?token=secret" },
    });
    await expect(new SupabaseStorageAdapter("logos").list("org/branding")).rejects.toThrow(
      /Supabase Storage list failed: bad \[url\]/,
    );
  });

  it("deletes in batches, and nothing at all for an empty list", async () => {
    supabase.remove.mockResolvedValue({ data: [], error: null });
    const storage = new SupabaseStorageAdapter("logos");
    await storage.delete([]);
    expect(supabase.remove).not.toHaveBeenCalled();
    const paths = Array.from({ length: 250 }, (_, i) => `org/branding/${i}.png`);
    await storage.delete(paths);
    expect(supabase.remove).toHaveBeenCalledTimes(3);
    expect(supabase.remove.mock.calls.flatMap((call) => call[0])).toEqual(paths);
  });

  it("a failed delete throws", async () => {
    supabase.remove.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(new SupabaseStorageAdapter("logos").delete(["a.png"])).rejects.toThrow(
      /Supabase Storage delete failed: nope/,
    );
  });
});
