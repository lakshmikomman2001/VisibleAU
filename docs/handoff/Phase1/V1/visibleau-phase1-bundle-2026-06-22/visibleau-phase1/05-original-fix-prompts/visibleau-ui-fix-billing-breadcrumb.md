# VisibleAU UI Fix — Billing Page Breadcrumb
**Claude Code prompt — one line only, do not change anything else.**

---

## File to edit
`app/(auth)/settings/billing/page.tsx`

---

## The fix

```tsx
// BEFORE
breadcrumbs={['Account', 'Billing']}

// AFTER — Sprint 4 BH3/BK5 spec uses 'Settings'
breadcrumbs={['Settings', 'Billing']}
```

---

## Acceptance checklist

- [ ] Breadcrumb reads: `Settings > Billing`
- [ ] No other changes made to this file
