export function formatSlack(eventName: string, payload: Record<string, unknown>) {
  const brandName = String(payload.brandName ?? "Unknown");
  const score = payload.scoreComposite ?? payload.currentScore ?? "—";
  const url = String(payload.url ?? "");

  return {
    text: `${brandName} — ${eventName}: score ${score}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${brandName} — ${eventName}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Score:* ${score}` },
          {
            type: "mrkdwn",
            text: `*Date:* ${payload.createdAt ?? new Date().toISOString()}`,
          },
        ],
      },
      ...(url
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "View audit" },
                  url,
                },
              ],
            },
          ]
        : []),
    ],
  };
}
