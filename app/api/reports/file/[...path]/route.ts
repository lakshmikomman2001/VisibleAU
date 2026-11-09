import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * The local storage driver's report PDFs, `<organizationId>/<reportId>.pdf` (development and tests; production
 * keeps them in Supabase and this answers 404). They're written at run time, so these paths are hidden from
 * Turbopack's file tracing: a path joined from the environment and the request made it trace the whole
 * project into this route (the build's "Encountered unexpected file in NFT list" warning, 9 Nov).
 *
 * null unless the path is a file in this workspace's own folder: its first segment the workspace's id, and no
 * ".." out of that folder (the old check was only that the path's text started with the id).
 */
function workspaceReportFile(organizationId: string, segments: string[]): string | null {
  const base = resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.STORAGE_LOCAL_DIR || "./storage/reports",
  );
  const folder = resolve(/*turbopackIgnore: true*/ base, organizationId);
  const file = resolve(/*turbopackIgnore: true*/ folder, ...segments.slice(1));
  return segments[0] === organizationId && file.startsWith(folder + sep) ? file : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver !== "local") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segments } = await params;
  const fullPath = workspaceReportFile(currentUser.organizationId, segments);
  if (!fullPath) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await stat(/*turbopackIgnore: true*/ fullPath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await readFile(/*turbopackIgnore: true*/ fullPath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${segments[segments.length - 1]}"`,
    },
  });
}
