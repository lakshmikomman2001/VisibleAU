import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { localSeoResults } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LocalSeoView } from "@/components/domain/local-seo/local-seo-view";

export default async function LocalSeoPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;

  const [result] = await db
    .select()
    .from(localSeoResults)
    .where(eq(localSeoResults.brandId, brandId))
    .orderBy(desc(localSeoResults.checkedAt))
    .limit(1);

  if (!result) {
    return (
      <div style={{ padding: "28px 32px" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Local SEO
        </h1>
        <div
          style={{
            marginTop: 24,
            padding: 32,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            textAlign: "center",
          }}
        >
          <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            No Local SEO data yet. Local SEO runs automatically after each
            audit.
          </p>
        </div>
      </div>
    );
  }

  return <LocalSeoView result={result} />;
}
