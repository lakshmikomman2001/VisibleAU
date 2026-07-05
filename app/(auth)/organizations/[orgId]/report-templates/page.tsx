"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";

const ALL_SECTIONS = [
  { type: "executive_summary", label: "Executive Summary", wired: true },
  { type: "score_breakdown", label: "Score Breakdown", wired: true },
  { type: "mention_source_divide", label: "Mention vs Source Divide", wired: true },
  { type: "fan_out_coverage", label: "Fan-Out Coverage", wired: true },
  { type: "topical_gap_summary", label: "Topical Gap Summary", wired: true },
  { type: "source_type_gaps", label: "Source Type Gaps", wired: false },
  { type: "agent_readiness", label: "Agent Readiness", wired: false },
  { type: "linkedin_performance", label: "LinkedIn Performance", wired: false },
  { type: "consensus_score", label: "Consensus Score", wired: false },
  { type: "knowledge_panel_status", label: "Knowledge Panel", wired: false },
  { type: "entity_home_status", label: "Entity Home Status", wired: false },
  { type: "evidence_snapshots", label: "Evidence Snapshots", wired: false },
] as const;

type Tone = "professional" | "plain_english" | "executive";

interface SectionEntry {
  type: string;
  include: boolean;
  order: number;
}

interface Template {
  id: string;
  name: string;
  templateType: string;
  sections: SectionEntry[];
  tone: Tone;
  isDefault: boolean;
  createdAt: string;
}

export default function ReportTemplatesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const [editName, setEditName] = useState("New Template");
  const [editTone, setEditTone] = useState<Tone>("professional");
  const [editSections, setEditSections] = useState<SectionEntry[]>(
    ALL_SECTIONS.map((s, i) => ({ type: s.type, include: s.wired, order: i })),
  );
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch(`/api/organizations/${orgId}/report-templates`)
      .then(async (res) => {
        if (res.ok) setTemplates(await res.json());
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  const toggleSection = (type: string) => {
    setEditSections((prev) =>
      prev.map((s) => (s.type === type ? { ...s, include: !s.include } : s)),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/organizations/${orgId}/report-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        templateType: "standard",
        sections: editSections,
        tone: editTone,
        isDefault: false,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setTemplates((prev) => [...prev, created]);
      setShowForm(false);
      setEditName("New Template");
      setEditTone("professional");
      setEditSections(
        ALL_SECTIONS.map((s, i) => ({ type: s.type, include: s.wired, order: i })),
      );
    }
    setSaving(false);
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                Report Templates
              </h1>
              <LayerBadge layer="communication" />
            </div>
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Customize which sections appear in your reports
            </p>
          </div>
          {!showForm && (
            <button
              className="h-9 px-4 text-[13px] font-medium rounded-md"
              style={{ background: "var(--layer-comm)", color: "#fff" }}
              onClick={() => setShowForm(true)}
            >
              New template
            </button>
          )}
        </div>

        {showForm && (
          <div
            className="rounded-xl p-6 mb-6"
            style={{ backgroundColor: "var(--bg-elevated)", boxShadow: "var(--elevation-rest)" }}
          >
            <div className="mb-4">
              <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                Template Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full h-9 px-3 rounded-md text-[13px]"
                style={{
                  backgroundColor: "var(--bg-base)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Tone
              </label>
              <div className="flex gap-2">
                {(["professional", "plain_english", "executive"] as Tone[]).map((t) => (
                  <button
                    key={t}
                    className="px-3 py-1.5 rounded-md text-[12px] font-medium"
                    style={{
                      backgroundColor: editTone === t ? "var(--layer-comm)" : "var(--bg-base)",
                      color: editTone === t ? "#fff" : "var(--text-secondary)",
                      border: editTone === t ? "none" : "1px solid var(--border-default)",
                    }}
                    onClick={() => setEditTone(t)}
                  >
                    {t.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-[11px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Sections
              </label>
              <div className="space-y-1.5">
                {editSections.map((s) => {
                  const meta = ALL_SECTIONS.find((a) => a.type === s.type);
                  return (
                    <label
                      key={s.type}
                      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer"
                      style={{
                        backgroundColor: s.include ? "color-mix(in srgb, var(--layer-comm) 10%, transparent)" : "transparent",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={s.include}
                        onChange={() => toggleSection(s.type)}
                        className="accent-[var(--layer-comm)]"
                      />
                      <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                        {meta?.label ?? s.type}
                      </span>
                      {meta && !meta.wired && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: "var(--bg-hover)",
                            color: "var(--text-tertiary)",
                          }}
                        >
                          coming soon
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className="h-9 px-5 text-[13px] font-medium rounded-md"
                style={{ background: "var(--layer-comm)", color: "#fff" }}
                onClick={handleSave}
                disabled={saving || !editName.trim()}
              >
                {saving ? "Saving..." : "Save template"}
              </button>
              <button
                className="h-9 px-4 text-[13px] rounded-md"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl anim-shimmer" style={{ backgroundColor: "var(--bg-hover)" }} />
            ))}
          </div>
        ) : templates.length === 0 && !showForm ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ backgroundColor: "var(--bg-elevated)", boxShadow: "var(--elevation-rest)" }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              No templates yet
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Create a template to customize your report sections
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-xl p-5"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {t.name}
                    </span>
                    {t.isDefault && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: "var(--layer-comm)", color: "#fff" }}
                      >
                        Default
                      </span>
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    {t.tone.replace("_", " ")}
                  </span>
                </div>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {t.sections.filter((s: SectionEntry) => s.include).length} of {t.sections.length} sections active
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
