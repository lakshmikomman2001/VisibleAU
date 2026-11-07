"use client";

import { formatDistanceToNow } from "date-fns";
import { Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCan } from "@/components/domain/role-context";
import type { WebhookDelivery, WebhookEndpoint } from "@/db/schema";
import { refusalMessage } from "@/lib/governance/permissions";

/** An endpoint as the page shows it: never its signing secret, which is shown once, when it's made. */
export type WebhookEndpointSummary = Omit<WebhookEndpoint, "signingSecret">;

const CHANNELS = ["slack", "discord", "sheets", "airtable", "email", "custom"] as const;

export function WebhooksSettingsView({
  endpoints: initialEndpoints,
  recentDeliveries,
  validEvents,
  locked = false,
}: {
  endpoints: WebhookEndpointSummary[];
  recentDeliveries: WebhookDelivery[];
  validEvents: string[];
  /** On a plan without webhooks, under the locked card: the endpoints, to delete only. */
  locked?: boolean;
}) {
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [channel, setChannel] = useState<string>("slack");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["audit.completed"]);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Sri, 8 Nov: webhooks send the workspace's data outside it, so only an owner or admin changes them.
  const canManage = useCan("manage_integrations");

  const handleCreate = async () => {
    setRefusal(null);
    const res = await fetch("/api/webhooks-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, channel, events: selectedEvents }),
    });
    if (res.ok) {
      const { signingSecret, ...created } = (await res.json()) as WebhookEndpoint;
      setNewSecret(signingSecret);
      setEndpoints((prev) => [
        {
          ...created,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as WebhookEndpointSummary,
        ...prev,
      ]);
      setUrl("");
      setSelectedEvents(["audit.completed"]);
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      setRefusal(typeof body.error === "string" ? body.error : "The endpoint couldn't be created.");
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
    setRefusal(null);
    const res = await fetch(`/api/webhooks-config/${id}/test`, { method: "POST" });
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (typeof body.error === "string") setRefusal(body.error);
    }
  };

  const toggleEvent = (e: string) => {
    setSelectedEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  };

  const STATUS_TONE: Record<string, { bg: string; color: string }> = {
    success: { bg: "var(--success-soft)", color: "var(--success)" },
    failed: { bg: "var(--danger-soft)", color: "var(--danger)" },
    dead: { bg: "var(--danger-soft)", color: "var(--danger)" },
  };

  return (
    <div style={{ padding: locked ? 0 : "28px 32px" }}>
      {!locked && (
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
          {canManage && (
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
          )}
        </div>
      )}

      {!canManage && (
        <p
          data-role-locked="manage_integrations"
          style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}
        >
          {refusalMessage("manage_integrations")}
        </p>
      )}

      {/* New endpoint form */}
      {showForm && !locked && canManage && (
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
                  background: selectedEvents.includes(e) ? "var(--accent-muted)" : "transparent",
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

          {refusal && (
            <p role="alert" className="text-[13px] mt-3" style={{ color: "var(--danger)" }}>
              {refusal}
            </p>
          )}
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
            const tone = STATUS_TONE[ep.lastDeliveryStatus ?? ""] ?? {
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
                {!locked && canManage && (
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
                )}
                {canManage && (
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
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delivery history */}
      {!locked && (
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
                    background:
                      d.responseStatus && d.responseStatus < 400
                        ? "var(--success)"
                        : "var(--danger)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{d.event}</span>
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
      )}
    </div>
  );
}
