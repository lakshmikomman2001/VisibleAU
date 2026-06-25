# VisibleAU UI Fix — Brand Detail Page
**Claude Code prompt — rewrite this file completely.**

---

## File to rewrite
`app/(auth)/brands/[brandId]/page.tsx`

The current build renders only an inline form. The prototype specifies five distinct
sections. Rewrite the whole page — keep your existing auth, DB client, and PATCH
API wiring, replace everything else.

---

## Data to fetch (server component)

```typescript
import { db } from '@/db/client';
import { brands, audits } from '@/db/schema';
import { eq, and, isNull, desc, count, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { setRlsContext } from '@/lib/auth/rls';
import { redirect, notFound } from 'next/navigation';

export default async function BrandDetailPage({
  params,
}: {
  params: { brandId: string };
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/sign-in');
  await setRlsContext(db, currentUser.organizationId);

  // Brand — 404 if not found, soft-deleted, or cross-org
  const [brand] = await db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.id, params.brandId),
        eq(brands.organizationId, currentUser.organizationId),
        isNull(brands.deletedAt)
      )
    )
    .limit(1);

  if (!brand) notFound();

  // Audit count for this brand
  const [{ auditCount }] = await db
    .select({ auditCount: count() })
    .from(audits)
    .where(eq(audits.brandId, brand.id));

  // Last 12 audit composite scores for sparkline (Sprint 4)
  const recentAudits = await db
    .select({
      scoreComposite: audits.scoreComposite,
      completedAt: audits.completedAt,
    })
    .from(audits)
    .where(
      and(
        eq(audits.brandId, brand.id),
        eq(audits.status, 'complete' as const)
      )
    )
    .orderBy(desc(audits.completedAt))
    .limit(12);

  // Per-engine latest scores from confidenceIntervals of most recent audit
  const [latestAudit] = recentAudits;

  return (
    <BrandDetailClient
      brand={brand}
      auditCount={Number(auditCount)}
      recentAudits={recentAudits.reverse()} // chronological for sparkline
      latestAudit={latestAudit ?? null}
      currentUser={currentUser}
    />
  );
}
```

---

## Client component — `components/domain/brand/brand-detail-client.tsx`

This must be `'use client'` because it has edit state and a delete confirm dialog.

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Edit3, X, CheckCircle2, Trash2, ExternalLink,
  Tag, MapPin, Hash, Sparkles, ChevronRight,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import Link from 'next/link';
import { brandFormSchema, type BrandFormValues } from '@/lib/schemas/brand';

// --- Gradient palette — cycles by brand index (pass index from parent or use a fixed colour) ---
const BRAND_GRADIENT = 'linear-gradient(135deg, #f97316, #ea580c)';

// --- Engine display names ---
const ENGINE_DISPLAY: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

export function BrandDetailClient({ brand, auditCount, recentAudits, latestAudit, currentUser }) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: {
      name: brand.name,
      domain: brand.domain,
      vertical: brand.vertical,
      primaryRegions: brand.primaryRegions ?? [],
      competitors: brand.competitors ?? [],
    },
  });

  // --- SAVE ---
  const handleSave = async (values: BrandFormValues) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Brand updated');
      setEditMode(false);
      router.refresh();
    } catch {
      toast.error('Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  };

  // --- DELETE ---
  const handleDelete = async () => {
    try {
      await fetch(`/api/brands/${brand.id}`, { method: 'DELETE' });
      router.push('/brands');
    } catch {
      toast.error('Delete failed — please try again');
    }
  };

  // --- SPARKLINE data ---
  const sparkValues = recentAudits
    .map((a) => (a.scoreComposite ? parseFloat(a.scoreComposite) : null))
    .filter(Boolean) as number[];
  const sparkMax = Math.max(...sparkValues, 80); // min ceiling 80 so bars don't go full height

  return (
    <>
      {/* ============================================================
          PAGE SHELL — pass actions to your layout's actions slot
          If your app uses a layout with an `actions` prop:
            <PageLayout breadcrumbs={...} actions={<ActionsBar />}>
          Otherwise render ActionsBar at the top of this component.
         ============================================================ */}

      {/* --- ACTIONS BAR (top-right) --- */}
      {/* Wire these into your PageShell / layout actions prop.
          They must appear in the TOP-RIGHT header, NOT inline with the brand name. */}
      <div data-actions className="flex items-center gap-2">
        <button
          onClick={() => setEditMode(!editMode)}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px]
                     font-medium rounded-md border transition-all"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
          }}
        >
          {editMode ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
          {editMode ? 'Cancel' : 'Edit'}
        </button>

        {editMode && (
          <button
            onClick={form.handleSubmit(handleSave)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px]
                       font-medium rounded-md transition-all"
            style={{
              background: 'var(--accent-primary)',
              color: 'var(--accent-primary-fg)',
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}

        {/* Delete — small, secondary, danger colour */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px]
                     font-medium rounded-md border transition-all"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--danger)',               // red text, NOT red background
            border: '1px solid var(--border-default)',
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>

        {/* Run audit — primary CTA */}
        <Link
          href={`/audits/new?brandId=${brand.id}`}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[13px]
                     font-medium rounded-md transition-all"
          style={{
            background: 'var(--accent-primary)',
            color: 'var(--accent-primary-fg)',
          }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Run audit
        </Link>
      </div>

      {/* ============================================================
          PAGE BODY
         ============================================================ */}
      <div className="max-w-6xl mx-auto px-8 py-10">

        {/* ---- DELETE CONFIRM DIALOG ---- */}
        {showDeleteConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)' }}
          >
            <div
              className="p-6 max-w-md w-full mx-4 rounded-lg"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
              }}
            >
              <h2
                className="text-base font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Delete {brand.name}?
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                This will remove the brand from your workspace. Your audit history is
                preserved and accessible via direct links, but this brand will no longer
                appear in your brand list or portfolio. This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="inline-flex items-center h-8 px-3 text-[13px] font-medium
                             rounded-md border"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center h-8 px-3 text-[13px] font-medium
                             rounded-md"
                  style={{ background: 'var(--danger)', color: '#fff' }}
                >
                  Delete brand
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================
            SECTION 1 — BRAND HEADER
           ====================================================== */}
        <div className="flex items-start gap-5 mb-10">
          {/* Gradient avatar — 64×64 */}
          <div
            className="w-16 h-16 rounded-lg flex items-center justify-center
                       text-2xl font-bold shrink-0"
            style={{ background: BRAND_GRADIENT, color: '#fff' }}
          >
            {brand.name[0].toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + Active badge */}
            <div className="flex items-baseline gap-3">
              <h1
                className="text-2xl font-semibold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {brand.name}
              </h1>
              {/* Active badge — green dot */}
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-medium
                           px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--success-soft)',
                  color: 'var(--success)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Active
              </span>
            </div>

            {/* Domain link */}
            <a
              href={`https://${brand.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] flex items-center gap-1.5 mt-1.5 hover:opacity-70
                         transition-opacity w-fit"
              style={{ color: 'var(--text-secondary)' }}
            >
              {brand.domain}
              <ExternalLink className="w-3 h-3" />
            </a>

            {/* Metadata row */}
            <div className="flex items-center gap-3 mt-3 text-[12px]">
              <div
                className="flex items-center gap-1.5"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Tag className="w-3 h-3" />
                {brand.vertical}
              </div>
              <div
                className="flex items-center gap-1.5"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <MapPin className="w-3 h-3" />
                {(brand.primaryRegions as string[]).length > 0
                  ? `${(brand.primaryRegions as string[]).length} suburb(s)`
                  : 'No regions set'}
              </div>
              <div
                className="flex items-center gap-1.5"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Hash className="w-3 h-3" />
                {auditCount} audit{auditCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================
            SECTION 2 — 4 KPI CARDS (Sprint 4)
            Show skeletons if no audits yet — layout must exist
           ====================================================== */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {auditCount === 0
            ? [0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-lg p-5 animate-pulse"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <div
                    className="h-3 w-24 rounded mb-4"
                    style={{ background: 'var(--bg-hover)' }}
                  />
                  <div
                    className="h-7 w-16 rounded"
                    style={{ background: 'var(--bg-hover)' }}
                  />
                </div>
              ))
            : [
                {
                  label: 'Visibility score',
                  value: latestAudit?.scoreComposite
                    ? parseFloat(latestAudit.scoreComposite).toFixed(1)
                    : '—',
                },
                { label: 'Avg position', value: '—' },
                {
                  label: `Total mentions (${auditCount} audits)`,
                  value: '—',
                },
                { label: 'Sentiment', value: '—' },
              ].map((m, i) => (
                <div
                  key={i}
                  className="rounded-lg p-5"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <div
                    className="text-xs mb-2"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {m.label}
                  </div>
                  <div
                    className="text-2xl font-semibold tracking-tight"
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {m.value}
                  </div>
                </div>
              ))}
        </div>

        {/* ======================================================
            SECTION 3 — SPARKLINE + PER-ENGINE (Sprint 4)
           ====================================================== */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {/* Sparkline card — col-span-2 */}
          <div
            className="col-span-2 rounded-lg p-6"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                className="text-sm font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Audit history
              </h3>
              <Link
                href="/audits"
                className="text-[12px] hover:opacity-70"
                style={{ color: 'var(--text-tertiary)' }}
              >
                View all
              </Link>
            </div>

            {sparkValues.length === 0 ? (
              <div
                className="h-32 flex items-center justify-center text-[12px]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                No completed audits yet
              </div>
            ) : (
              <>
                <div className="flex items-end gap-1 h-32">
                  {sparkValues.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${(v / sparkMax) * 100}%`,
                        background:
                          'linear-gradient(180deg, var(--accent-blue), var(--accent-blue-soft))',
                      }}
                    />
                  ))}
                </div>
                <div
                  className="flex justify-between mt-2 text-[10px]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <span>{sparkValues.length} weeks ago</span>
                  <span>Now</span>
                </div>
              </>
            )}
          </div>

          {/* Per-engine breakdown card */}
          <div
            className="rounded-lg p-6"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
            }}
          >
            <h3
              className="text-sm font-semibold mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Per-engine breakdown
            </h3>

            {auditCount === 0 ? (
              <p
                className="text-[12px]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Run your first audit to see engine scores.
              </p>
            ) : (
              <div className="space-y-3.5">
                {['chatgpt', 'claude', 'gemini', 'perplexity'].map((engine) => {
                  // Read per-engine score from latestAudit.confidenceIntervals if available,
                  // otherwise show placeholder bars
                  return (
                    <div key={engine}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className="text-[12.5px] font-medium"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {ENGINE_DISPLAY[engine]}
                        </span>
                        <span
                          className="text-[12px] font-semibold"
                          style={{
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          —
                        </span>
                      </div>
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: 'var(--accent-muted)' }}
                      >
                        <div className="h-full w-0 rounded-full"
                             style={{ background: 'var(--success)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ======================================================
            SECTION 4 — INLINE EDIT FORM
            Always visible (not click-to-edit) — BH4 fix
           ====================================================== */}
        <div
          className="rounded-lg p-6"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
          }}
        >
          <h3
            className="text-sm font-semibold mb-6"
            style={{ color: 'var(--text-primary)' }}
          >
            Brand settings
          </h3>

          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-5">
            {/* Brand name */}
            <div>
              <label
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Brand name
              </label>
              <input
                {...form.register('name')}
                disabled={!editMode}
                className="w-full h-9 px-3 rounded-md text-[13px] transition-colors"
                style={{
                  background: editMode ? 'var(--bg-base)' : 'transparent',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  cursor: editMode ? 'text' : 'default',
                }}
              />
              {form.formState.errors.name && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Domain */}
            <div>
              <label
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Domain
              </label>
              <input
                {...form.register('domain')}
                disabled={!editMode}
                className="w-full h-9 px-3 rounded-md text-[13px] transition-colors"
                style={{
                  background: editMode ? 'var(--bg-base)' : 'transparent',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  cursor: editMode ? 'text' : 'default',
                }}
              />
            </div>

            {/* Vertical */}
            <div>
              <label
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Vertical
              </label>
              <select
                {...form.register('vertical')}
                disabled={!editMode}
                className="w-full h-9 px-3 rounded-md text-[13px] transition-colors"
                style={{
                  background: editMode ? 'var(--bg-base)' : 'transparent',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  cursor: editMode ? 'pointer' : 'default',
                }}
              >
                <option value="tradies">Tradies</option>
                <option value="allied_health">Allied Health</option>
                <option value="saas">SaaS</option>
              </select>
            </div>

            {/* Primary Regions — read-only display when not editing */}
            <div>
              <label
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Primary regions
              </label>
              {!editMode ? (
                <div className="flex flex-wrap gap-1.5">
                  {(brand.primaryRegions as string[]).length === 0 ? (
                    <span
                      className="text-[12px]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      No regions set
                    </span>
                  ) : (
                    (brand.primaryRegions as string[]).map((r) => (
                      <span
                        key={r}
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: 'var(--accent-muted)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {r.split(':')[1] ?? r}
                      </span>
                    ))
                  )}
                </div>
              ) : (
                // When editing, use the CompetitorsInput pattern (tag-input)
                // Reuse your existing region picker from the brand wizard if available
                <p
                  className="text-[12px]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Region editing — use your existing region picker component from
                  the brand wizard (lib/locations/). If not extracted yet, add a
                  plain text input as a placeholder.
                </p>
              )}
            </div>

            {/* Competitors — read-only display when not editing */}
            <div>
              <label
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Competitors
              </label>
              {!editMode ? (
                <div className="flex flex-wrap gap-1.5">
                  {(brand.competitors as string[]).length === 0 ? (
                    <span
                      className="text-[12px]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      No competitors set
                    </span>
                  ) : (
                    (brand.competitors as string[]).map((c) => (
                      <span
                        key={c}
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: 'var(--accent-muted)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {c}
                      </span>
                    ))
                  )}
                </div>
              ) : (
                // Reuse the CompetitorsInput component from BK1 fix if extracted
                <p
                  className="text-[12px]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Competitor editing — reuse CompetitorsInput component (tag-input
                  pattern: type + Enter → badge chip, × to remove).
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
```

---

## Breadcrumb + layout wiring

In `app/(auth)/brands/[brandId]/page.tsx`, wire the breadcrumb and actions:

```tsx
// Pass to your PageShell / layout:
breadcrumbs={['Workspace', 'Brands', brand.name]}  // NOT 'Detail'

// Pass the actions from BrandDetailClient's data-actions div
// to the layout's actions slot — or render them inside the layout
// using a pattern like `<Header actions={<ActionsBar />} />`
```

---

## Acceptance checklist

- [ ] Brand header renders: 64×64 gradient avatar + brand name h1 + "Active" green badge
- [ ] Domain shows as a clickable link with ExternalLink icon
- [ ] Metadata row shows: Tag + vertical · MapPin + N suburb(s) · Hash + N audits
- [ ] 4 KPI skeleton cards render when auditCount === 0 (layout contract holds)
- [ ] Sparkline card (col-span-2) renders with "No completed audits yet" when empty
- [ ] Per-engine breakdown card renders with ENGINE_DISPLAY names
- [ ] Inline form shows: name, domain, vertical, primaryRegions (read-only chips), competitors (read-only chips)
- [ ] Edit button top-right toggles form to editable state
- [ ] Delete button top-right — small, secondary, red text (NOT a red background button)
- [ ] Delete button opens a confirm dialog before deleting
- [ ] Run audit button top-right — primary style, links to `/audits/new?brandId=...`
- [ ] Breadcrumb reads: `Workspace > Brands > Bondi Plumbing` (brand name, not "Detail")
- [ ] No inline Delete button next to the brand name title
