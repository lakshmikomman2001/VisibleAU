import { formatAirtable } from "./channels/airtable";
import { formatCustomHttp } from "./channels/custom-http";
import { formatDiscord } from "./channels/discord";
import { formatSheets } from "./channels/sheets";
import { formatSlack } from "./channels/slack";

export function formatForChannel(
  channel: string,
  eventName: string,
  payload: unknown,
): unknown {
  const p = payload as Record<string, unknown>;
  switch (channel) {
    case "slack":
      return formatSlack(eventName, p);
    case "discord":
      return formatDiscord(eventName, p);
    case "sheets":
      return formatSheets(eventName, p);
    case "airtable":
      return formatAirtable(eventName, p);
    case "email":
      return {
        to: p.url ?? "",
        subject: `VisibleAU: ${eventName}`,
        html: `<p>${p.brandName ?? "Brand"} — score ${p.scoreComposite ?? "—"}</p><a href="${p.url ?? ""}">View audit</a>`,
      };
    case "custom":
      return formatCustomHttp(eventName, payload);
    default:
      return payload;
  }
}
