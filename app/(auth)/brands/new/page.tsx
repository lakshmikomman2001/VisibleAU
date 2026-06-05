"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewBrandPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get("name") as string,
      domain: formData.get("domain") as string,
      vertical: formData.get("vertical") as string,
    };

    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "Failed to create brand");
      setLoading(false);
      return;
    }

    router.push("/brands");
    router.refresh();
  }

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-semibold">Create brand</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Brand name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            placeholder="My Business"
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
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            placeholder="mybusiness.com.au"
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
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Select a vertical</option>
            <option value="tradies">Tradies</option>
            <option value="allied_health">Allied Health</option>
            <option value="saas">SaaS</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create brand"}
        </button>
      </form>
    </div>
  );
}
