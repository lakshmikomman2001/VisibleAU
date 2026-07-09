# Claude Code — print my org UUID (for the Sprint 4 org-scoped screen URLs)

I need my organization's UUID to construct the URLs for the two org-scoped Sprint 4 screens
(`/organizations/[orgId]/report-templates` and `/organizations/[orgId]/delivery-schedules`), which are currently
orphaned (no nav entry) and only reachable by URL.

**Print the org UUID(s) — read only, no writes.** I'm testing on the prod DB via local, so use the DB the app is
currently pointed at.

```bash
# List organizations with their UUID, name, and tier (so I can pick the right one — the Agency org):
psql "$DATABASE_URL" -c "SELECT id, name, tier, created_at FROM organizations ORDER BY created_at DESC;"
```

If `$DATABASE_URL` isn't set in the shell, read it from the env the app loads:
```bash
grep -m1 "DATABASE_URL" .env.local .env.test.local .env 2>/dev/null
# then run the psql above with that connection string
```

**Report:** the `id` (UUID), `name`, and `tier` for each org — I'll pick the Agency org (e.g. "Test Org Agency 1"
/ the one that owns "Agency SEO Sydney"). Confirm which DB (dev/prod) this read from.

Then the two URLs I need are:
- `localhost:3000/organizations/{that-uuid}/report-templates`
- `localhost:3000/organizations/{that-uuid}/delivery-schedules`

Read-only — do not modify any data.
