"use client";

import { formatDistanceToNow } from "date-fns";
import { Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { WebhookDelivery, WebhookEndpoint } from "@/db/schema";

const CHANNELS = [
  "slack",
  "discord",
  "sheets",
  "airtable",
  "email",
  "custom",
] as const;

export function WebhooksSettingsView({
  endpoints: initialEndpoints,
  recentDeliveries,
  validEvents,
}: {
  endpoints: WebhookEndpoint[];
  recentDeliveries: WebhookDelivery[];
  validEvents: string[];
}) {
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState<string>("slack");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "audit.completed",
  ]);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const handleCreate = async () => {
    const res = await fetch("/api/webhooks-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, channel, events: selectedEvents }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewSecret(data.signingSecret);
      setEndpoints((prev) => [
        { ...data, isActive: true, createdAt: new Date(), updatedAt: new Date() } as WebhookEndpoint,
        ...prev,
      ]);
      setUrl("");
      setSelectedEvents(["audit.completed"]);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/webhooks-config/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setEndpoints((prev) => prev.filter((ep) => ep.id !== id));
    }
  };

  const handleTest = async (id: string) => {
    await fetch(`/api/webhooks-config/${id}/test`, { method: "POST" });
  };

  const toggleEvent = (e: string) => {
    setSelectedEvents((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
    );
  };

  const STATUS_TONE: Record<string, { bg: string; color: string }> = {
    success: { bg: "var(--success-soft)", color: "var(--success)" },
    failed: { bg: "var(--danger-soft)", color: "var(--danger)" },
    dead: { bg: "var(--danger-soft)", color: "var(--danger)" },
  };

  return (
    <div style={{ padding: "28px 32px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Webhooks
        </h1>
        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm);
            setNewSecret(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 6,
            border: "1px solid var(--border-default)",
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          Add endpoint
        </button>
      </div>

      {/* New endpoint form */}
      {showForm && (
        <div
          style={{
            padding: 20,
            marginBottom: 24,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://hooks.slack.com/..."
              style={{
                flex: 1,
                padding: "6px 10px",
                fontSize: 13,
                borderRadius: 6,
                border: "1px solid var(--border-default)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
              }}
            />
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                borderRadius: 6,
                border: "1px solid var(--border-default)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
              }}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {validEvents.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggleEvent(e)}
                style={{
                  padding: "2px 8px",
                  fontSize: 11,
                  borderRadius: 9999,
                  border: "1px solid var(--border-default)",
                  background: selectedEvents.includes(e)
                    ? "var(--accent-muted)"
                    : "transparent",
                  color: selectedEvents.includes(e)
                    ? "var(--text-primary)"
                    : "var(--text-tertiary)",
                  cursor: "pointer",
                }}
              >
                {e}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={!url || selectedEvents.length === 0}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 6,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: "pointer",
              opacity: !url || selectedEvents.length === 0 ? 0.5 : 1,
            }}
          >
            Create endpoint
          </button>

          {newSecret && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 6,
                background: "var(--info-soft)",
                fontSize: 12,
                color: "var(--info)",
                wordBreak: "break-all",
              }}
            >
              Signing secret (copy now — shown only once):{" "}
              <code style={{ fontWeight: 600 }}>{newSecret}</code>
            </div>
          )}
        </div>
      )}

      {/* Endpoints list */}
      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          Endpoints ({endpoints.length})
        </div>

        {endpoints.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: 13,
            }}
          >
            No webhook endpoints configured.
          </div>
        ) : (
          endpoints.map((ep) => {
            const tone =
              STATUS_TONE[ep.lastDeliveryStatus ?? ""] ?? {
                bg: "var(--accent-muted)",
                color: "var(--text-tertiary)",
              };
            return (
              <div
                key={ep.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ep.url}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 9999,
                        background: "var(--accent-muted)",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {ep.channel}
                    </span>
                    {ep.lastDeliveryStatus && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 9999,
                          background: tone.bg,
                          color: tone.color,
                        }}
                      >
                        {ep.lastDeliveryStatus}
                      </span>
                    )}
                    {!ep.isActive && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 9999,
                          background: "var(--danger-soft)",
                          color: "var(--danger)",
                        }}
                      >
                        disabled
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTest(ep.id)}
                  title="Send test delivery"
                  style={{
                    padding: 6,
                    borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  <Send style={{ width: 14, height: 14 }} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ep.id)}
                  title="Delete endpoint"
                  style={{
                    padding: 6,
                    borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    background: "transparent",
                    color: "var(--danger)",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Delivery history */}
      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          Recent Deliveries
        </div>
        {recentDeliveries.length === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: 13,
            }}
          >
            No deliveries yet.
          </div>
        ) : (
          recentDeliveries.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 20px",
                borderBottom: "1px solid var(--border-subtle)",
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: d.responseStatus && d.responseStatus < 400
                    ? "var(--success)"
                    : "var(--danger)",
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {d.event}
              </span>
              <span style={{ color: "var(--text-tertiary)", flex: 1 }}>
                {d.responseStatus ?? "—"}
              </span>
              <span style={{ color: "var(--text-tertiary)" }}>
                {formatDistanceToNow(new Date(d.createdAt), {
                  addSuffix: true,
                }).replace("about ", "")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
