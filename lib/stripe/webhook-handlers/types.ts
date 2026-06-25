import type { db } from "@/db/client";

export type WebhookTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
