"use client";

import {
  Activity,
  Bot,
  Code,
  Edit3,
  ExternalLink,
  FileText,
  Hash,
  MapPin,
  MessageCircle,
  MonitorDot,
  Shield,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ENGINE_DISPLAY: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

interface BrandDetailClientProps {
  brand: {
    id: string;
    name: string;
    domain: string;
    vertical: string;
    region: string;
    competitors: string[];
    primaryRegions: string[];
  };
  auditCount: number;
  recentAudits: Array<{ scoreComposite: string | null; completedAt: string | null }>;
  latestAudit: { scoreComposite: string | null } | null;
  avgPosition: number | null;
  totalMentions: number;
  sentimentScore: number | null;
  engineStats: Array<{ engine: string; total: number; mentions: number }>;
}

export function BrandDetailClient({
  brand,
  auditCount,
  recentAudits,
  latestAudit,
  avgPosition,
  totalMentions,
  sentimentScore,
  engineStats,
}: BrandDetailClientProps) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);
  const [name, setName] = useState(brand.name);
  const [domain, setDomain] = useState(brand.domain);
  const [vertical, setVertical] = useState(brand.vertical);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain, vertical }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEditMode(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
    router.push("/brands");
  };

  const handleRunAudit = async () => {
    setRunningAudit(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id }),
      });
      if (!res.ok) return;
      const { auditId } = await res.json();
      router.push(`/audits/${auditId}`);
    } finally {
      setRunningAudit(false);
    }
  };

  const sparkValues = recentAudits
    .map((a) => (a.scoreComposite ? Number.parseFloat(a.scoreComposite) : null))
    .filter((v): v is number => v !== null);
  const sparkMax = Math.max(...sparkValues, 80);

  const inputStyle = (enabled: boolean): React.CSSProperties => ({
    width: "100%",
    height: 36,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 13,
    background: enabled ? "var(--bg-base)" : "transparent",
    border: "1px solid var(--border-default)",
    color: "var(--text-primary)",
    cursor: enabled ? "text" : "default",
    outline: "none",
  });

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      {/* Delete confirm dialog */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              padding: 24,
              maxWidth: 420,
              width: "100%",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              Delete {brand.name}?
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 24 }}>
              This will remove the brand from your workspace. Audit history is preserved but the
              brand will no longer appear in your list. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  background: "var(--danger)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Delete brand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => setEditMode(!editMode)}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {editMode ? (
            <X style={{ width: 14, height: 14 }} />
          ) : (
            <Edit3 style={{ width: 14, height: 14 }} />
          )}
          {editMode ? "Cancel" : "Edit"}
        </button>
        {editMode && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 32,
              padding: "0 12px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              background: "var(--accent-primary)",
              color: "var(--accent-primary-fg)",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--bg-elevated)",
            color: "var(--danger)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Trash2 style={{ width: 14, height: 14 }} />
          Delete
        </button>
        <button
          type="button"
          onClick={handleRunAudit}
          disabled={runningAudit}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--accent-primary)",
            color: "var(--accent-primary-fg)",
            border: "none",
            cursor: runningAudit ? "not-allowed" : "pointer",
            opacity: runningAudit ? 0.5 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Sparkles style={{ width: 14, height: 14 }} />
          {runningAudit ? "Starting..." : "Run audit"}
        </button>
      </div>

      {/* Section 1: Brand header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 40 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            fontWeight: 700,
            color: "#fff",
            background: "linear-gradient(135deg, #f97316, #ea580c)",
          }}
        >
          {brand.name[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              {brand.name}
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 500,
                background: "var(--success-soft)",
                color: "var(--success)",
              }}
            >
              <span
                style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }}
              />
              Active
            </span>
          </div>
          <a
            href={`https://${brand.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
            }}
          >
            {brand.domain}
            <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 12,
              fontSize: 12,
              color: "var(--text-tertiary)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Tag style={{ width: 12, height: 12 }} />
              {brand.vertical}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin style={{ width: 12, height: 12 }} />
              {brand.primaryRegions.length > 0
                ? `${brand.primaryRegions.length} suburb(s)`
                : "No regions set"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Hash style={{ width: 12, height: 12 }} />
              {auditCount} audit{auditCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Section: Audit tools nav */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {[
          {
            href: `/brands/${brand.id}/technical-audit`,
            label: "Technical Audit",
            icon: Activity,
            desc: "8-dimension score",
          },
          {
            href: `/brands/${brand.id}/robots-txt-config`,
            label: "Robots.txt",
            icon: Bot,
            desc: "27 AI bot matrix",
          },
          {
            href: `/brands/${brand.id}/llms-txt-generator`,
            label: "llms.txt",
            icon: FileText,
            desc: "Depth scoring",
          },
          {
            href: `/brands/${brand.id}/schema-audit`,
            label: "Schema",
            icon: Code,
            desc: "JSON-LD coverage",
          },
          {
            href: `/brands/${brand.id}/ssr-check`,
            label: "SSR Check",
            icon: MonitorDot,
            desc: "Server-side rendering",
          },
          {
            href: `/brands/${brand.id}/answer-capsules`,
            label: "Answer Capsules",
            icon: MessageCircle,
            desc: "Direct answers",
          },
          {
            href: `/brands/${brand.id}/brand-entity-audit`,
            label: "Brand Entity",
            icon: Shield,
            desc: "AU presence",
          },
          {
            href: `/brands/${brand.id}/signals`,
            label: "Signals",
            icon: Activity,
            desc: "Negative signals & injection",
          },
          {
            href: `/brands/${brand.id}/local-seo`,
            label: "Local SEO",
            icon: MapPin,
            desc: "AU directories & NAP",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "16px 16px",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 12,
              transition: "border-color 0.15s",
            }}
          >
            <item.icon
              style={{ width: 18, height: 18, color: "var(--accent-primary)", flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                {item.desc}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Section 2: KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {(auditCount === 0
          ? [0, 1, 2, 3].map((i) => ({ label: "", value: "", skeleton: true, key: i }))
          : [
              {
                label: "Visibility score",
                value: latestAudit?.scoreComposite
                  ? Number.parseFloat(latestAudit.scoreComposite).toFixed(1)
                  : "—",
                key: 0,
              },
              {
                label: "Avg position",
                value: avgPosition != null ? Number(avgPosition).toFixed(1) : "—",
                key: 1,
              },
              {
                label: `Total mentions (${auditCount} audit${auditCount !== 1 ? "s" : ""})`,
                value: totalMentions > 0 ? totalMentions.toLocaleString() : "—",
                key: 2,
              },
              {
                label: "Sentiment",
                value: sentimentScore != null ? Number(sentimentScore).toFixed(1) : "—",
                key: 3,
              },
            ].map((m) => ({ ...m, skeleton: false }))
        ).map((m) => (
          <div
            key={m.key}
            style={{
              padding: 20,
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
            }}
          >
            {m.skeleton ? (
              <>
                <div
                  style={{
                    height: 12,
                    width: 96,
                    borderRadius: 4,
                    marginBottom: 16,
                    background: "var(--bg-hover)",
                  }}
                />
                <div
                  style={{ height: 28, width: 64, borderRadius: 4, background: "var(--bg-hover)" }}
                />
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {m.value}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Section 3: Sparkline + Per-engine */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 40 }}>
        <div
          style={{
            padding: 24,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Audit history
            </h3>
            <Link
              href="/audits"
              style={{ fontSize: 12, color: "var(--text-tertiary)", textDecoration: "none" }}
            >
              View all
            </Link>
          </div>
          {sparkValues.length === 0 ? (
            <div
              style={{
                height: 128,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "var(--text-tertiary)",
              }}
            >
              No completed audits yet
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 128 }}>
                {sparkValues.map((v, i) => (
                  <div
                    key={`spark-${i}`}
                    style={{
                      flex: 1,
                      borderRadius: 2,
                      height: `${(v / sparkMax) * 100}%`,
                      background:
                        "linear-gradient(180deg, var(--accent-blue), var(--accent-blue-soft))",
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                }}
              >
                <span>{sparkValues.length} weeks ago</span>
                <span>Now</span>
              </div>
            </>
          )}
        </div>

        <div
          style={{
            padding: 24,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 16px",
            }}
          >
            Per-engine breakdown
          </h3>
          {auditCount === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Run your first audit to see engine scores.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {["chatgpt", "claude", "gemini", "perplexity"].map((engine) => {
                const stat = engineStats.find((e) => e.engine === engine);
                const pct = stat && stat.total > 0 ? (stat.mentions / stat.total) * 100 : 0;
                return (
                  <div key={engine}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)" }}
                      >
                        {ENGINE_DISPLAY[engine]}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {stat ? `${pct.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 9999,
                        overflow: "hidden",
                        background: "var(--accent-muted)",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 9999,
                          background: "var(--success)",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {/* TikTok placeholder — Coming v1.1 */}
              <div style={{ opacity: 0.45 }} title="Coming v1.1">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)" }}
                  >
                    TikTok
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "1px 6px",
                      borderRadius: 9999,
                      background: "var(--accent-muted)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    Coming v1.1
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 9999,
                    background: "var(--accent-muted)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Brand settings form */}
      <div
        style={{
          padding: 24,
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 24px",
          }}
        >
          Brand settings
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Brand name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editMode}
              style={inputStyle(editMode)}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Domain
            </label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={!editMode}
              style={inputStyle(editMode)}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Vertical
            </label>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              disabled={!editMode}
              style={inputStyle(editMode)}
            >
              <option value="tradies">Tradies</option>
              <option value="allied_health">Allied Health</option>
              <option value="saas">SaaS</option>
            </select>
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Primary regions
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {brand.primaryRegions.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No regions set</span>
              ) : (
                brand.primaryRegions.map((r) => (
                  <span
                    key={r}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontWeight: 500,
                      background: "var(--accent-muted)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {r.split(":")[1] ?? r}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Competitors
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {brand.competitors.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  No competitors set
                </span>
              ) : (
                brand.competitors.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontWeight: 500,
                      background: "var(--accent-muted)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {c}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
