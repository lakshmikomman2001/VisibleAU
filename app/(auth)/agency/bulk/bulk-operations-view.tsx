"use client";

import { useCallback, useState } from "react";
import { LoadError } from "@/components/shared/load-error";
import { pluralise } from "@/lib/format/pluralise";
import { useLoad } from "@/lib/hooks/use-load";
import { actionFailureMessage, fetchJson } from "@/lib/load/fetch-json";

interface BrandItem {
  id: string;
  name: string;
  domain: string;
}

// Follow-ups from af8de42..d1eb5a1, part 1: a failed /api/brands had no ok check and no catch, so the table
// said "No brands found." (and a network failure was an unhandled rejection). It says it couldn't load now.
async function loadBrands(signal: AbortSignal): Promise<BrandItem[]> {
  return (await fetchJson<{ brands: BrandItem[] }>("/api/brands", { signal })).brands;
}

/** Bulk re-audit and export: what page.tsx shows once the plan has them. */
export function BulkOperationsView() {
  const loaded = useLoad(loadBrands, { isEmpty: (rows) => rows.length === 0 });
  const brands = loaded.data ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === brands.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(brands.map((b) => b.id)));
    }
  };

  const handleBulkReaudit = useCallback(async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/agency/bulk-reaudit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandIds: Array.from(selected) }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(`Bulk re-audit queued for ${pluralise(data.queued ?? selected.size, "brand")}.`);
      } else {
        setMessage(await actionFailureMessage(res, "The re-audit couldn't be queued."));
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }, [selected]);

  const handleBulkExport = useCallback(async () => {
    if (selected.size === 0) return;
    setActionLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/agency/bulk-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandIds: Array.from(selected) }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "bulk-export.csv";
        a.click();
        URL.revokeObjectURL(url);
        setMessage("CSV export downloaded.");
      } else {
        setMessage(await actionFailureMessage(res, "The export couldn't be made."));
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }, [selected]);

  if (loaded.status === "loading") {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading brands...</p>
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Bulk Operations</h1>
        <LoadError what="your brands" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Bulk Operations</h1>

      <div className="flex items-center gap-3">
        <button
          onClick={handleBulkReaudit}
          disabled={selected.size === 0 || actionLoading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
        >
          Bulk Re-audit ({selected.size})
        </button>
        <button
          onClick={handleBulkExport}
          disabled={selected.size === 0 || actionLoading}
          className="px-4 py-2 border rounded-md text-sm font-medium disabled:opacity-50"
        >
          Bulk CSV Export ({selected.size})
        </button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={selected.size === brands.length && brands.length > 0}
                  onChange={selectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">Brand</th>
              <th className="px-4 py-3 text-left font-medium">Domain</th>
            </tr>
          </thead>
          <tbody>
            {brands.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  No brands found.
                </td>
              </tr>
            ) : (
              brands.map((brand) => (
                <tr key={brand.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(brand.id)}
                      onChange={() => toggleSelect(brand.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{brand.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{brand.domain}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
