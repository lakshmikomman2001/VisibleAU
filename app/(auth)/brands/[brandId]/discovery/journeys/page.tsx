"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { JourneyFlowChart } from "@/components/domain/discovery/journey-flow-chart";
import { JourneyResultCard } from "@/components/domain/discovery/journey-result-card";

interface Journey {
  id: string;
  journeyName: string;
  vertical: string;
  buyerStage: string;
  promptSequence: Array<{ turn: number; prompt: string; intent?: string }>;
  isTemplate?: boolean;
}

interface RunResult {
  id: string;
  engine: string;
  journeyScore: number | null;
  firstMentionTurn: number | null;
  brandAppearedInNTurns: number;
  totalTurns: number;
  turnResults: Array<{ turn: number; brandMentioned: boolean }>;
  runAt: string;
}

export default function JourneysPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [templates, setTemplates] = useState<Journey[]>([]);
  const [results, setResults] = useState<Record<string, RunResult[]>>({});
  const [selectedJourney, setSelectedJourney] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);

  const loadJourneys = useCallback(async () => {
    const res = await fetch(`/api/brands/${brandId}/journeys`);
    if (res.status === 403) { setLocked(true); return; }
    if (res.ok) {
      const data = await res.json();
      const owned = data.journeys ?? [];
      const tpls = data.templates ?? [];
      setJourneys(owned);
      setTemplates(tpls);
      if (owned.length > 0 && !selectedJourney) setSelectedJourney(owned[0].id);
    }
  }, [brandId, selectedJourney]);

  useEffect(() => {
    loadJourneys().finally(() => setLoading(false));
  }, [loadJourneys]);

  useEffect(() => {
    if (!selectedJourney) return;
    if (selectedJourney.startsWith("template-")) return;
    if (results[selectedJourney]) return;
    fetch(`/api/brands/${brandId}/journeys/${selectedJourney}/results`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setResults((prev) => ({ ...prev, [selectedJourney]: data }));
        }
      });
  }, [selectedJourney, brandId, results]);

  const handleClone = async (template: Journey) => {
    setCloning(template.id);
    const res = await fetch(`/api/brands/${brandId}/journeys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        journeyName: template.journeyName,
        vertical: template.vertical,
        buyerStage: template.buyerStage,
        promptSequence: template.promptSequence,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setJourneys((prev) => [created, ...prev]);
      setSelectedJourney(created.id);
    }
    setCloning(null);
  };

  const handleRun = async (journeyId: string) => {
    setRunning(journeyId);
    const res = await fetch(`/api/brands/${brandId}/journeys/${journeyId}/run`, { method: "POST" });
    if (res.ok) {
      setTimeout(() => setRunning(null), 2000);
    } else {
      setRunning(null);
    }
  };

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="discovery" />
        <TierGate requiredTier="Agency" locked><div className="h-64" /></TierGate>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="discovery" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)" }} />
          ))}
        </div>
      </div>
    );
  }

  const active = [...journeys, ...templates].find((j) => j.id === selectedJourney);
  const isActiveTemplate = active?.isTemplate === true;
  const activeResults = selectedJourney && !isActiveTemplate ? results[selectedJourney] ?? [] : [];

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="discovery" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Conversational Journeys
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-3">
          {journeys.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                Your Journeys
              </p>
              {journeys.map((j) => (
                <button
                  key={j.id}
                  onClick={() => setSelectedJourney(j.id)}
                  className="w-full rounded-lg border p-3 text-left transition-all"
                  style={{
                    borderColor: j.id === selectedJourney ? "var(--layer-discovery)" : "var(--border-default)",
                    backgroundColor: j.id === selectedJourney ? "color-mix(in srgb, var(--layer-discovery) 8%, transparent)" : "var(--bg-elevated)",
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{j.journeyName}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {j.vertical} &middot; {j.buyerStage} &middot; {j.promptSequence.length} turns
                  </p>
                </button>
              ))}
            </div>
          )}

          {templates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                Pre-built Templates
              </p>
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedJourney(t.id)}
                  className="w-full rounded-lg border p-3 text-left transition-all"
                  style={{
                    borderColor: t.id === selectedJourney ? "var(--layer-discovery)" : "var(--border-subtle)",
                    backgroundColor: t.id === selectedJourney ? "color-mix(in srgb, var(--layer-discovery) 8%, transparent)" : "var(--bg-subtle)",
                    borderStyle: "dashed",
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.journeyName}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {t.buyerStage} &middot; {t.promptSequence.length} turns &middot; template
                  </p>
                </button>
              ))}
            </div>
          )}

          {journeys.length === 0 && templates.length === 0 && (
            <div className="py-8 text-center" style={{ color: "var(--text-tertiary)" }}>
              <p className="text-sm">No journeys yet &mdash; clone a pre-built one to start</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {active && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium" style={{ color: "var(--text-primary)" }}>
                  {active.journeyName}
                </h2>
                {isActiveTemplate ? (
                  <button
                    onClick={() => handleClone(active)}
                    disabled={cloning === active.id}
                    className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--layer-discovery)",
                      color: "#fff",
                    }}
                  >
                    {cloning === active.id ? "Cloning..." : "Clone & Use"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleRun(active.id)}
                    disabled={running === active.id}
                    className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--layer-discovery)",
                      color: "#fff",
                    }}
                  >
                    {running === active.id ? "Queued..." : "Run Journey"}
                  </button>
                )}
              </div>

              {isActiveTemplate && (
                <div
                  className="rounded-lg border px-4 py-3 text-sm"
                  style={{
                    borderColor: "color-mix(in srgb, var(--layer-discovery) 30%, transparent)",
                    backgroundColor: "color-mix(in srgb, var(--layer-discovery) 6%, transparent)",
                    color: "var(--text-secondary)",
                  }}
                >
                  This is a pre-built template. Clone it to customize and run it for your brand.
                </div>
              )}

              <div
                className="rounded-lg border p-4"
                style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-elevated)" }}
              >
                <p className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Prompt Flow
                </p>
                <JourneyFlowChart turns={active.promptSequence} />
              </div>

              {!isActiveTemplate && activeResults.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    Results
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activeResults.map((r) => (
                      <JourneyResultCard
                        key={r.id}
                        journeyName={active.journeyName}
                        engine={r.engine}
                        journeyScore={r.journeyScore}
                        firstMentionTurn={r.firstMentionTurn}
                        turnResults={
                          Array.isArray(r.turnResults)
                            ? (r.turnResults as Array<{ turn: number; brandMentioned: boolean }>)
                            : []
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {!isActiveTemplate && activeResults.length === 0 && (
                <div className="py-8 text-center" style={{ color: "var(--text-tertiary)" }}>
                  <p className="text-sm">No results yet — run the journey to see scores.</p>
                </div>
              )}
            </>
          )}

          {!active && journeys.length === 0 && templates.length > 0 && (
            <div className="flex flex-col items-center justify-center py-12" style={{ color: "var(--text-tertiary)" }}>
              <p className="text-lg font-medium">No journeys yet</p>
              <p className="mt-1 text-sm">Select a pre-built template and clone it to start</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
