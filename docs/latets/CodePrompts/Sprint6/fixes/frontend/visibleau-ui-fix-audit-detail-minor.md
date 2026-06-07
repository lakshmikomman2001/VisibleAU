# VisibleAU UI Fix — Audit Detail Minor Patches
**Claude Code prompt — two targeted edits, do not rewrite the file.**

---

## File to edit
`app/(auth)/audits/[auditId]/page.tsx`

---

## Patch 1 — Engine display name capitalisation

### Problem
Engine keys stored in the DB are lowercase (`chatgpt`, `claude`, `gemini`, `perplexity`).
The current render uses `charAt(0).toUpperCase() + slice(1)` which produces "Chatgpt" — wrong.
The prototype always shows "ChatGPT" (not "Chatgpt").

### Fix
Add this constant near the top of the file, before the component return:

```typescript
const ENGINE_DISPLAY: Record<string, string> = {
  chatgpt:    'ChatGPT',
  claude:     'Claude',
  gemini:     'Gemini',
  perplexity: 'Perplexity',
};
```

Then find the per-engine row where the engine name is rendered and replace:

```tsx
// BEFORE — produces "Chatgpt"
{e.engine.charAt(0).toUpperCase() + e.engine.slice(1)}

// AFTER — produces "ChatGPT"
{ENGINE_DISPLAY[e.engine] ?? e.engine}
```

---

## Patch 2 — Breadcrumb last crumb

### Problem
Current breadcrumb shows: `Workspace > Audits > Detail`
Prototype spec: last crumb should be the actual audit number, e.g. `Audit #99`

### Fix
Find the breadcrumbs prop passed to the page layout (or PageShell / layout component)
and change the last item from the static string `'Detail'` to the dynamic audit number:

```tsx
// BEFORE
breadcrumbs={['Workspace', 'Audits', 'Detail']}

// AFTER
breadcrumbs={['Workspace', 'Audits', `Audit #${audit.auditNumber}`]}
```

`audit.auditNumber` is already fetched as part of the existing audit query —
no new DB call needed.

---

## Acceptance checklist

- [ ] Per-engine card shows "ChatGPT" (not "Chatgpt"), "Claude", "Gemini", "Perplexity"
- [ ] Breadcrumb reads: `Workspace > Audits > Audit #99` (or whatever the real audit number is)
- [ ] No other changes made to this file
