"use client";

import { useCallback, useEffect, useState } from "react";

interface BrandItem {
  id: string;
  name: string;
  domain: string;
}

export default function BulkOperationsPage() {
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBrands(data);
        } else if (data.brands) {
          setBrands(data.brands);
        }
      })
      .finally(() => setLoading(false));
  }, []);

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
        setMessage(`Bulk re-audit queued for ${data.queued ?? selected.size} brand(s).`);
      } else {
        const err = await res.json();
        setMessage(err.error || "Failed to queue bulk re-audit.");
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
        const err = await res.json();
        setMessage(err.error || "Failed to export.");
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }, [selected]);

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading brands...</p>
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
        {message && (
          <span className="text-sm text-muted-foreground">{message}</span>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
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
