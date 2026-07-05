import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";

const BASE_DIR = process.env.STORAGE_LOCAL_DIR || "./storage/reports";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver !== "local") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segments } = await params;
  const filePath = segments.join("/");

  if (!filePath.startsWith(currentUser.organizationId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fullPath = join(BASE_DIR, filePath);

  try {
    await stat(fullPath);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await readFile(fullPath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${segments[segments.length - 1]}"`,
    },
  });
}
