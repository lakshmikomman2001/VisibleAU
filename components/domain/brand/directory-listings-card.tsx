"use client";

import { useEffect, useState } from "react";

type DirectoryStatus = "listed" | "not_listed" | "unsure";

interface DirectoryRow {
  key: string;
  name: string;
  status: DirectoryStatus | null;
  profileUrl: string | null;
  confirmedAt: string | null;
}

interface RowDraft {
  status: DirectoryStatus | "";
  profileUrl: string;
}

/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part C) --
 * the owner's own confirmed directory presence. Never fetches a pasted
 * link -- the API route validates it by host + the directory's own
 * profile-URL pattern (lib/directories/registry.ts) and nothing else.
 * Nothing is pre-selected: a directory this brand hasn't confirmed yet
 * shows a blank "Choose..." placeholder, never a guessed default.
 */
export function DirectoryListingsCard({ brandId }: { brandId: string }) {
  const [directories, setDirectories] = useState<DirectoryRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(`/api/brands/${brandId}/directory-listings`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { directories: DirectoryRow[] }) => {
        if (cancelled) return;
        setDirectories(data.directories);
        const nextDrafts: Record<string, RowDraft> = {};
        for (const dir of data.directories) {
          nextDrafts[dir.key] = { status: dir.status ?? "", profileUrl: dir.profileUrl ?? "" };
        }
        setDrafts(nextDrafts);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load your directory listings. Try reloading the page.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  async function save(key: string) {
    const draft = drafts[key];
    if (!draft?.status) return;
    setSavingKey(key);
    setRowError((prev) => ({ ...prev, [key]: "" }));
    try {
      const res = await fetch(`/api/brands/${brandId}/directory-listings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directoryKey: key,
          status: draft.status,
          ...(draft.status === "listed" ? { profileUrl: draft.profileUrl.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setRowError((prev) => ({ ...prev, [key]: body?.error ?? "Couldn't save that -- try again." }));
        return;
      }
      setDirectories((prev) =>
        prev
          ? prev.map((d) =>
              d.key === key
                ? { ...d, status: body.status, profileUrl: body.profileUrl, confirmedAt: body.confirmedAt }
                : d,
            )
          : prev,
      );
    } catch {
      setRowError((prev) => ({ ...prev, [key]: "Couldn't save that -- check your connection and try again." }));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div
      role="region"
      aria-label="Directory listings"
      style={{
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Directory listings
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          Tell us where you're listed -- we never check this for you automatically.
        </p>
      </div>

      {loading && (
        <div style={{ padding: 20 }} aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 16,
                borderRadius: 4,
                marginBottom: 10,
                background: "var(--bg-subtle)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <div style={{ padding: 20, fontSize: 13, color: "var(--danger)" }} role="alert">
          {loadError}
        </div>
      )}

      {!loading && !loadError && directories && directories.length === 0 && (
        <div style={{ padding: 20, fontSize: 13, color: "var(--text-tertiary)" }}>
          No directories are relevant to this brand's confirmed category yet.
        </div>
      )}

      {!loading &&
        !loadError &&
        directories?.map((dir) => {
          const draft = drafts[dir.key] ?? { status: "", profileUrl: "" };
          const error = rowError[dir.key];
          const saving = savingKey === dir.key;
          const inputId = `directory-status-${dir.key}`;
          const urlInputId = `directory-url-${dir.key}`;

          return (
            <div
              key={dir.key}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ minWidth: 140, flex: "1 1 140px" }}>
                <label htmlFor={inputId} style={{ fontSize: 13, color: "var(--text-primary)" }}>
                  {dir.name}
                </label>
                {dir.status === "listed" && dir.confirmedAt && (
                  <div style={{ fontSize: 11, color: "var(--success)", marginTop: 2 }}>
                    Listed (confirmed by you, {new Date(dir.confirmedAt).toLocaleDateString()})
                  </div>
                )}
              </div>

              <select
                id={inputId}
                value={draft.status}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [dir.key]: { ...prev[dir.key], status: e.target.value as DirectoryStatus | "" },
                  }))
                }
                style={{
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--border-default)",
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="" disabled>
                  Choose...
                </option>
                <option value="listed">Listed</option>
                <option value="not_listed">Not listed</option>
                <option value="unsure">Not sure</option>
              </select>

              {draft.status === "listed" && (
                <>
                  <label htmlFor={urlInputId} style={{ position: "absolute", left: -9999 }}>
                    Your {dir.name} profile link
                  </label>
                  <input
                    id={urlInputId}
                    type="url"
                    placeholder={`Paste your ${dir.name} profile link`}
                    value={draft.profileUrl}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [dir.key]: { ...prev[dir.key], profileUrl: e.target.value },
                      }))
                    }
                    style={{
                      fontSize: 13,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-base)",
                      color: "var(--text-primary)",
                      flex: "1 1 220px",
                      minWidth: 180,
                    }}
                  />
                </>
              )}

              <button
                type="button"
                onClick={() => save(dir.key)}
                disabled={!draft.status || saving}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "none",
                  background: !draft.status || saving ? "var(--bg-subtle)" : "var(--accent)",
                  color: !draft.status || saving ? "var(--text-tertiary)" : "var(--accent-text)",
                  cursor: !draft.status || saving ? "default" : "pointer",
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>

              {error && (
                <div style={{ fontSize: 12, color: "var(--danger)", width: "100%" }} role="alert">
                  {error}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
