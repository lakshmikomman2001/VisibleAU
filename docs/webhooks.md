# Outbound webhooks

VisibleAU can push events to a Slack channel, Discord channel, Google
Sheet, Airtable base, email address, or a custom HTTPS endpoint, as
configured per organization via `webhook_endpoints` (one row per
destination: `url`, `channel`, the `events` it's subscribed to, and its
own `signingSecret`). This covers what each event means, what's
actually in the payload today, and how delivery works. Source of
truth: `lib/webhooks/`, `inngest/functions/fanout-webhooks.ts`,
`inngest/functions/deliver-webhook.ts`.

## How a webhook fires

1. An internal Inngest event (e.g. `audit.complete`, `drift.detected`)
   is sent by the feature that produced it.
2. `fanoutWebhooksFn` (`inngest/functions/fanout-webhooks.ts`) picks it
   up, maps it to a public event name (see the table below), and loads
   every **active** endpoint in that event's organization whose
   `events` array contains that public name.
3. For each matching endpoint, it sends a `webhook.deliver` event
   (deduplicated per `internalEventId` + endpoint, so a retried Inngest
   step never double-delivers).
4. `deliverWebhookFn` (`inngest/functions/deliver-webhook.ts`) formats
   the payload for that endpoint's `channel` (`lib/webhooks/format.ts`),
   signs it, and POSTs it. Inngest retries the function itself up to 5
   times on failure (its own step-retry, separate from the "5 recent
   deliveries" rule below).

## Delivery

- `POST` to the endpoint's `url`, JSON body, 10-second timeout.
- Headers: `X-VisibleAU-Event: <event name>`, `X-VisibleAU-Signature:
  sha256=<hex>` (HMAC-SHA256 of the exact JSON body string, keyed on
  the endpoint's own `signingSecret` — verify by recomputing the same
  HMAC over the raw body you received and comparing).
- Every delivery attempt (success or failure) is logged to
  `webhook_deliveries`. After 5 consecutive failed/no-response
  deliveries to the same endpoint, it's automatically set `isActive =
  false` (`lastDeliveryStatus: "dead"`) — re-activate it from
  `/settings/webhooks` (or its config API) once the destination is
  fixed; VisibleAU does not retry a dead endpoint on its own.

## `score_basis: "mention_rate"`

Every payload that carries a score field (`scoreComposite`,
`currentScore`, `previousScore`, or `scoreDelta`) also carries
`score_basis: "mention_rate"`. **The score is the Frequency headline —
the % of organic AI answers that mentioned the brand — never a
weighted blend of Position/Sentiment/Context/Source-citation.** A
`null` `scoreComposite` means insufficient data (fewer than 10
successful organic answers), not a measured zero. The explicit
`score_basis` field exists so an integration built before 19 Oct 2026
can tell the field's meaning changed without guessing from the number
alone — any payload missing `score_basis` predates that change.

## Events

Only the events below are actually wired up (an Inngest function sends
them; `fanout-webhooks.ts`'s own `EVENT_NAME_MAP` is the source of
truth for the public name each maps to). **Payload fields are listed
as they're genuinely sent today, not as a future ideal** — several
events currently carry only bare identifiers, with richer fields
(severity, counts, deltas) not yet attached. If you need a field that
isn't listed, it isn't being sent — don't build an integration around
it until it ships.

| Event | Fires when | Payload fields sent today |
|---|---|---|
| `audit.completed` | An audit finishes | `brandId`, `organizationId`, `auditId`, `scoreComposite` (number, mention rate 0–100, or `null`), `score_basis` |
| `drift.detected` | A brand's score moves enough to trip the drift detector | `brandId`, `organizationId`, `auditId` only — no `severity`/`scoreDelta`/`affectedDimensions` yet, despite what `lib/webhooks/events.ts`'s `DriftDetectedPayload` type declares |
| `recommendation.created` | New recommendations are generated for a brand | `auditId`, `brandId`, `organizationId` only — no `recommendationCount`/`highPriorityCount` yet |
| `report.generated` | A scheduled/manual narrative report finishes | `organizationId`, `brandId`, `reportId` |
| `hallucination.detected` | The hallucination scanner finds new incidents | `organizationId`, `brandId`, `incidentCount` |
| `hallucination.acknowledged` | A user acknowledges a hallucination incident | `organizationId`, `brandId`, `hallucinationId` |
| `visibility.trend.updated` | The weekly visibility-trend aggregate recomputes | `brandId`, `organizationId`, `periodLabel` |
| `agent.readiness.scored` | An agent-readiness scan completes | `brandId`, `organizationId`, `totalScore` |
| `crawler.impersonation-detected` | A verified-crawler check finds a spoofed hit | `organizationId`, `brandId`, `crawlerName`, `spoofedCount`, `totalCount` |

`audit.score.dropped` and `audit.score.changed` are **reserved event
names** (`lib/webhooks/events.ts`'s `VALID_EVENTS`, usable as a value
in an endpoint's `events` array) that nothing currently emits — no
Inngest function sends either one yet. An endpoint subscribed to them
will simply never receive anything until that's built.

None of the events above include a `url` field in their raw data — a
channel formatter that reads `payload.url` (Slack's button, Discord's
embed link, Sheets'/Airtable's URL column) will render it empty except
for `audit.completed`, which doesn't set one either today. Don't rely
on the link field until this is addressed.

## Per-channel payload shape

`formatForChannel(channel, eventName, payload)` (`lib/webhooks/format.ts`)
reshapes the same raw payload above for each channel:

- **slack**: `{ text, score_basis, blocks: [...] }` — a header block
  naming the brand + event, a section with Score / Score basis / Date
  fields, and a "View audit" button when `url` is present.
- **discord**: `{ embeds: [{ title, color, fields: [Score, score_basis,
  Delta], url, footer, timestamp }] }` — embed colour is red for
  `significant_drop`, green for `significant_rise`, blue otherwise
  (based on `severity`, which — see above — isn't actually populated
  for any live event yet, so this currently always renders blue).
- **sheets**: one flat row object — `{ event, brand, score, score_basis,
  delta, timestamp, url }` — appended to the configured sheet.
- **airtable**: `{ fields: { Event, Brand, Score, score_basis, Delta,
  Date, URL } }` — `Score` is `null` (not `0`) when there's
  insufficient data.
- **email**: `{ to, subject, html, score_basis }` — a one-line summary;
  says "not enough data yet" instead of a number when `scoreComposite`
  is `null`.
- **custom**: `{ event, timestamp, data: <raw payload, + score_basis if
  a score field is present> }` — the least reshaped option, closest to
  the raw event data in the table above.

## Testing an endpoint

`POST /api/webhooks-config/:id/test` sends a synthetic `audit.completed`
payload through the real `formatForChannel` + delivery path (with an
extra `X-VisibleAU-Test: true` header), without needing a real audit to
complete first. It's a fuller payload than a real `audit.completed`
delivery today — it also includes `brandName`, `createdAt`, and `url`,
none of which the real fanout path (`inngest/functions/fanout-
webhooks.ts`) currently attaches (it only has `auditId`, `brandId`,
`organizationId`, `scoreComposite`, `score_basis` to work with).
