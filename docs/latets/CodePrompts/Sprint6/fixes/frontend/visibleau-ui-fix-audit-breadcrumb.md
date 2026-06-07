# VisibleAU UI Fix — Audit Detail Breadcrumb
**Claude Code prompt — one targeted edit only, do not change anything else.**

---

## File to edit
`app/(auth)/audits/[auditId]/page.tsx`

---

## The fix

Find the breadcrumbs prop and change the last item from the static string `'Detail'`
to the dynamic audit number.

```tsx
// BEFORE
breadcrumbs={['Workspace', 'Audits', 'Detail']}

// AFTER
breadcrumbs={['Workspace', 'Audits', `Audit #${audit.auditNumber}`]}
```

`audit.auditNumber` is already fetched by the existing DB query — no new data needed.

---

## Acceptance checklist

- [ ] Breadcrumb reads: `Workspace > Audits > Audit #99` (the real audit number, not "Detail")
- [ ] No other changes made to this file
