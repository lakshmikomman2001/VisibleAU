"use client";

import { Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Brand {
  id: string;
  name: string;
  domain: string;
  vertical: string;
  region: string;
  competitors: string[];
  primaryRegions: string[];
}

export default function BrandDetailPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const router = useRouter();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/brands/${brandId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => setBrand(data.brand))
      .catch(() => router.push("/brands"))
      .finally(() => setLoading(false));
  }, [brandId, router]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!brand) return;
    setSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name") as string,
      domain: formData.get("domain") as string,
      vertical: formData.get("vertical") as string,
    };

    const res = await fetch(`/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "Failed to save");
      setSaving(false);
      return;
    }

    const data = await res.json();
    setBrand(data.brand);
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this brand? This cannot be undone.")) return;
    await fetch(`/api/brands/${brandId}`, { method: "DELETE" });
    router.push("/brands");
    router.refresh();
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!brand) return null;

  return (
    <div className="p-8 max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{brand.name}</h1>
        <button
          type="button"
          onClick={handleDelete}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Region: {brand.region.toUpperCase()}</p>

      <form onSubmit={handleSave} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Brand name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={brand.name}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="domain" className="block text-sm font-medium">
            Domain
          </label>
          <input
            id="domain"
            name="domain"
            type="text"
            required
            defaultValue={brand.domain}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="vertical" className="block text-sm font-medium">
            Vertical
          </label>
          <select
            id="vertical"
            name="vertical"
            required
            defaultValue={brand.vertical}
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="tradies">Tradies</option>
            <option value="allied_health">Allied Health</option>
            <option value="saas">SaaS</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
