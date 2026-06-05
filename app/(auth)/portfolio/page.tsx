import { and, count, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function PortfolioPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const [{ count: brandCount }] = await db
    .select({ count: count() })
    .from(brands)
    .where(and(eq(brands.organizationId, currentUser.organizationId), isNull(brands.deletedAt)));

  if (brandCount < 2) redirect("/dashboard?toast=need-2-brands");

  const orgBrands = await db
    .select()
    .from(brands)
    .where(and(eq(brands.organizationId, currentUser.organizationId), isNull(brands.deletedAt)));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-6">Portfolio Overview</h1>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Brands</p>
          <p className="text-3xl font-bold">{brandCount}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orgBrands.map((brand) => (
          <a
            key={brand.id}
            href={`/brands/${brand.id}`}
            className="block border rounded-lg p-4 hover:border-foreground/20"
          >
            <h3 className="font-medium">{brand.name}</h3>
            <p className="text-sm text-muted-foreground">{brand.domain}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
