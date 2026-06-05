import { z } from "zod/v4";

export const brandFormSchema = z.object({
  name: z.string().min(2, "Brand name must be at least 2 characters").max(100),
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, {
      message: "Enter a domain without http:// (e.g. bondiplumbing.com.au)",
    })
    .transform((d) => d.replace(/^www\./i, "")),
  vertical: z.enum(["tradies", "allied_health", "saas"]),
  primaryRegions: z.array(z.string()).min(1, "Select at least one region").max(5),
  competitors: z.array(z.string().max(100)).max(10).default([]),
});

export type BrandFormValues = z.infer<typeof brandFormSchema>;
