"use client";

import { useRef, useState } from "react";
import { Upload, Radio, Cloud, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface SetupPanelProps {
  brandId: string;
  totalHits: number;
  onUploadComplete?: () => void;
}

interface IngestPath {
  id: string;
  icon: typeof Upload;
  title: string;
  tier: string;
  desc: string;
  detail: string;
  recommended?: boolean;
  active?: boolean;
}

const INGEST_PATHS: IngestPath[] = [
  {
    id: "upload",
    icon: Upload,
    title: "Upload a log file",
    tier: "Starter",
    desc: "Works everywhere. Export your access log from cPanel, nginx or Apache and drop it here.",
    detail: ".log / .gz / .csv · Combined or Common Log Format",
    recommended: true,
  },
  {
    id: "snippet",
    icon: Radio,
    title: "Live snippet",
    tier: "Free",
    desc: "A one-line middleware snippet streams AI-bot visits to VisibleAU in real time.",
    detail: "Already active on this brand · POST /api/visit",
    active: true,
  },
  {
    id: "logpush",
    icon: Cloud,
    title: "Cloudflare Logpush",
    tier: "Growth",
    desc: "For high-traffic sites on a Cloudflare Enterprise plan.",
    detail: "Requires CF Enterprise — most SMB plans cannot use this",
  },
];

type UploadState = "idle" | "uploading" | "success" | "error";

export function AgentAnalyticsSetupPanel({ brandId, totalHits, onUploadComplete }: SetupPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".log") && !name.endsWith(".gz") && !name.endsWith(".csv")) {
      setUploadState("error");
      setUploadMessage("Unsupported file type. Export a .log, .gz, or .csv access log.");
      return;
    }

    setUploadState("uploading");
    setUploadMessage("");

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`/api/brands/${brandId}/crawler-logs/upload`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });

      if (res.status === 403) {
        setUploadState("error");
        setUploadMessage("Upgrade to Starter to upload log files.");
        return;
      }
      if (res.status === 404) {
        setUploadState("error");
        setUploadMessage("Brand not found. Check your access permissions.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setUploadState("error");
        setUploadMessage(body?.error ?? "Upload failed. Try again.");
        return;
      }

      setUploadState("success");
      setUploadMessage("Log file accepted — processing in background. Data will appear shortly.");
      onUploadComplete?.();
    } catch {
      setUploadState("error");
      setUploadMessage("Network error. Check your connection and try again.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--text-primary)" }}
        >
          Connect your logs
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          AI crawlers never touch your analytics. They only appear in server logs — so we need one of
          these.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {INGEST_PATHS.map((p) => {
          const Icon = p.icon;
          const isUpload = p.id === "upload";

          return (
            <div
              key={p.id}
              className="relative rounded-xl p-5"
              style={{
                background: "var(--bg-elevated)",
                border: p.recommended
                  ? "1px solid var(--layer-retrieval)"
                  : "1px solid var(--border-default)",
              }}
            >
              {p.recommended && (
                <span
                  className="absolute -top-2 left-4 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: "var(--layer-retrieval)",
                    color: "var(--accent-primary-fg)",
                  }}
                >
                  Recommended
                </span>
              )}

              <div className="mb-3 flex items-start justify-between">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: "var(--layer-retrieval-soft)" }}
                >
                  <Icon style={{ width: 18, height: 18, color: "var(--layer-retrieval)" }} />
                </div>
                {p.active && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: "var(--success-soft)", color: "var(--success)" }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--success)" }}
                    />
                    Live
                  </span>
                )}
              </div>

              <div
                className="mb-1 text-sm font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {p.title}
              </div>
              <div
                className="mb-2.5 text-[12px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {p.desc}
              </div>
              <div
                className="text-[11px]"
                style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}
              >
                {p.detail}
              </div>

              {isUpload && (
                <div className="mt-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".log,.gz,.csv"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                      e.target.value = "";
                    }}
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                    className="rounded-lg border border-dashed p-3 text-center text-[12px] transition-colors"
                    style={{
                      borderColor: dragOver
                        ? "var(--layer-retrieval)"
                        : "var(--border-default)",
                      background: dragOver
                        ? "var(--layer-retrieval-soft)"
                        : "transparent",
                      color: "var(--text-secondary)",
                      cursor: uploadState === "uploading" ? "not-allowed" : "pointer",
                      opacity: uploadState === "uploading" ? 0.6 : 1,
                    }}
                  >
                    {uploadState === "uploading" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2
                          className="animate-spin"
                          style={{ width: 14, height: 14, color: "var(--layer-retrieval)" }}
                        />
                        Uploading…
                      </span>
                    ) : (
                      "Drop a file here or click to choose"
                    )}
                  </div>

                  {uploadState === "success" && (
                    <div
                      className="mt-2 flex items-start gap-2 rounded-lg p-2 text-[11px]"
                      style={{
                        background: "var(--success-soft)",
                        color: "var(--success)",
                      }}
                    >
                      <CheckCircle2 style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                      {uploadMessage}
                    </div>
                  )}

                  {uploadState === "error" && (
                    <div
                      className="mt-2 flex items-start gap-2 rounded-lg p-2 text-[11px]"
                      style={{
                        background: "color-mix(in srgb, var(--danger) 10%, transparent)",
                        color: "var(--danger)",
                      }}
                    >
                      <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                      {uploadMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation block — §6.2 "received N hits" / §7.2 "zero is a finding" */}
      {totalHits > 0 ? (
        <div
          className="flex items-center gap-3 rounded-xl p-4"
          style={{
            background: "var(--success-soft)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <CheckCircle2
            style={{ width: 16, height: 16, color: "var(--success)", flexShrink: 0 }}
          />
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Connected.</strong> We&apos;ve received{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
              {totalHits.toLocaleString()}
            </span>{" "}
            AI-crawler hits in the last 30 days. Only AI-bot traffic is stored — your human visitors
            are never logged.
          </div>
        </div>
      ) : (
        <div
          className="flex items-center gap-3 rounded-xl p-4"
          style={{
            background: "color-mix(in srgb, var(--warning) 8%, transparent)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <AlertCircle
            style={{ width: 16, height: 16, color: "var(--warning)", flexShrink: 0 }}
          />
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Connected</strong> — no AI crawler has
            visited yet. This is itself a finding: it may mean AI engines can&apos;t discover you.
            Check Retrieval and CDN Shield.
          </div>
        </div>
      )}
    </div>
  );
}
