import { classifyAndStoreBrand } from "@/lib/brands/classify-and-store";
import { inngest } from "@/lib/inngest/client";

export const classifyOnBrandCreate = inngest.createFunction(
  { id: "classify-on-brand-create", retries: 3, triggers: [{ event: "brand/created" }] },
  async ({ event }: { event: { data: { brandId: string } } }) => {
    const { brandId } = event.data;
    await classifyAndStoreBrand(brandId);
  },
);
