"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * 2 Nov -- on the reports pages: when this brand's reports print no agency
 * name (its own or the workspace's), their cover shows only "Powered by
 * Vunnara", so say where to add one. Nothing until the answer is in, nothing
 * if it can't be read, and nothing on a plan without report branding: never a
 * hint that may be false.
 */
export function ReportBrandingHint({ brandId }: { brandId: string }) {
  const [agencyName, setAgencyName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    fetch(`/api/report-branding?brandId=${encodeURIComponent(brandId)}`)
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { agencyName?: string | null; available?: boolean };
        if (current && body.available !== false) setAgencyName(body.agencyName ?? null);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [brandId]);

  if (agencyName !== null) return null;

  return (
    <div
      className="rounded-lg px-4 py-3 mb-6 text-[13px]"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        color: "var(--text-secondary)",
      }}
      data-branding-hint
    >
      Your report covers show only &quot;Powered by Vunnara&quot;.{" "}
      <Link
        href="/settings/report-branding"
        className="underline focus-visible:outline focus-visible:outline-2"
        style={{ color: "var(--accent-blue)" }}
      >
        Add your agency name and logo in Account → Report branding
      </Link>
      .
    </div>
  );
}
