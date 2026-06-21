import { isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { classifyAndStoreBrand } from "@/lib/brands/classify-and-store";
import { inngest } from "@/lib/inngest/client";

export const classifyExistingBrands = inngest.createFunction(
  { id: "classify-existing-brands", triggers: [{ event: "brand/classify-all" }] },
  async ({
    step,
  }: {
    step: {
      run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
      sleep: (id: string, duration: string) => Promise<void>;
    };
  }) => {
    const unclassified = await step.run("fetch-unclassified", async () => {
      return db
        .select({ id: brands.id, name: brands.name })
        .from(brands)
        .where(isNull(brands.classification));
    });

    for (const brand of unclassified) {
      await step.run(`classify-${brand.id}`, async () => {
        await classifyAndStoreBrand(brand.id);
      });
      await step.sleep(`delay-${brand.id}`, "2s");
    }

    return { classified: unclassified.length };
  },
);
