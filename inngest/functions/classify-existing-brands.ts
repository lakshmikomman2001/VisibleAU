import { isNull } from "drizzle-orm";
import { serviceDb } from "@/db/client";
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
      return serviceDb
        .select({ id: brands.id, name: brands.name })
        .from(brands)
        .where(isNull(brands.classification));
    });

    for (const brand of unclassified) {
      await step.run(`classify-${brand.id}`, async () => {
        // Vunnara Build 1, Part C.5: classifyAndStoreBrand now re-throws
        // on failure (so classify-on-brand-create.ts's retries: 3 can
        // fire for a single brand). This batch job classifies MANY
        // brands in one sweep -- one bad brand shouldn't abort every
        // brand still queued behind it, so the throw is caught locally
        // here. The failure is never lost: classifyAndStoreBrand
        // already persisted classification_status = 'failed' and
        // classification_error on this brand's own row before
        // re-throwing.
        try {
          await classifyAndStoreBrand(brand.id);
        } catch (err) {
          console.error("[classifyExistingBrands] brand failed, continuing batch", {
            brandId: brand.id,
            err,
          });
        }
      });
      await step.sleep(`delay-${brand.id}`, "2s");
    }

    return { classified: unclassified.length };
  },
);
