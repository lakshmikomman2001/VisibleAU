# VisibleAU Phase 2 — SPRINT 8 PROMPT: GATE 2 FINDINGS (PASS 2 — fix-validation + fresh angle)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-8-prompt.md **v1.2** (Governance Intelligence, Layer 7)
# Canon used: v8.65 r2 (authorized; v8.67 touches none of Layer 7). Verified by content, not line #.
# Pass-1 angle: schema fidelity + the cross-sprint wiring (fanout producers, recordAction sites) →
#   S8-01, S8-02 + the OQ-1 ruling.
# Pass-2 angle (this doc): AUTHORIZATION ENFORCEMENT & PRIVILEGE BOUNDARIES — the security depth of
#   the governance model itself (does brand-scoped access actually isolate; is role-elevation
#   bounded; are privilege changes audited; invitation-token lifetime). The right lens for the
#   governance sprint and Sri's Security-non-negotiable rule; not examined by any prior pass.

---

## 1. VERDICT — **PASS-WITH-FIXES** (v1.2 fixes all correct; three new security/governance items from the fresh angle)

The v1.2 fixes are applied correctly and thoroughly (diff-verified, additions only — nothing
existing touched). The fresh authorization angle then surfaced three real items in the governance
*model* (one MODERATE, two LOW-MOD escalations) that sit beyond the wiring fixes, plus one minor
hardening note. None blocks the build; all matter for a governance/compliance layer.

**(a) v1.2 fixes — VERIFIED CORRECTLY APPLIED (diff against v1.0):**
- **S8-01 (the 2 missing fanout producer emits) — fully fixed.** §8.1 now reads "TWO MUST BE
  ADDED, three only verified": the 3 existing emits (report/generated S4, hallucination/detected
  S5, agent/readiness-scored S6) are verify-only; the 2 absent ones are explicit ADDs at source
  (`visibility/trend-updated` in aggregate-visibility-trend.ts after the visibility_trends UPSERT;
  `hallucination/acknowledged` in the PATCH acknowledge route on is_acknowledged=true), with the
  correct rationale (both LLD-specced only in the webhook spec). Both added to the §4 tree as
  BACKWARD EDITS, with source-level §12 greps, a `webhook-emit-sources.test.ts`, the §10 step, and
  a §13 pitfall. Every location I flagged.
- **S8-02 (the 5 upstream recordAction wirings) — fully fixed.** §6.1 now states only 2 of 7
  actions live in S8's code and names the 5 upstream routes (S4 draft, S7 journey-run, S5
  acknowledge, S3 benchmark), with the sharp clarification that those sprints *couldn't* have wired
  it (audit_trail didn't exist yet). Listed as §4-tree edits; the blanket `recordAction ≥1` grep
  replaced by 5 per-site greps; an integration-level test asserts all 7 call sites; §13 pitfall added.
- **OQ-1 ruling — recorded** in §0.6 (DEFER, reviewer + builder agree, pending Sri). **§1 polish**
  applied (record-data-residency.ts now explicit in the enumeration). All accurate.

---

## 2. FRESH ANGLE — AUTHORIZATION ENFORCEMENT & PRIVILEGE BOUNDARIES

I traced the RBAC model end-to-end: how brand_access is enforced (vs only stored), whether role
assignment is bounded, whether privilege changes are audited, and the invite-token lifetime.

| Control | Specified? | Gap |
|---|---|---|
| Org isolation (RLS organization_id) | ✓ on all 4 tables | — |
| `canPerform` honours brand_access | ✓ in §6.2 (takes brandId) | — |
| brand_access **enforced on data routes** | **✗** | **S8b-01** — RLS is org-level; existing brand routes never call canPerform → brand_access stored but not enforced |
| Role assignment bounded (admin ≠ make owner) | **✗** | **S8b-02** — PATCH role is "owner/admin", no owner-assignment guard |
| Privilege changes audited | **✗** | **S8b-03** — `member_role_changed`/`member_removed` in no action set |
| Invitation token lifetime | LLD chose no-expiry (deliberate) | note only |

---

## 3. NEW FINDINGS (pass 2)

### S8b-01 — [MODERATE] brand_access is the cross-brand isolation layer, but nothing enforces it on the existing brand routes
- **Where:** §6.2 (`canPerform(user, org, brandId, action)` "honour brand_access"); §0.5/§5.2 (the
  column); §0.4/§5.6 (RLS is on `organization_id`). LLD 8482 + the RLS spec.
- **The gap:** brand_access (null = all; `[brandId,…]` = restricted) is meant to confine a member
  (e.g. a contractor or account manager) to specific brands *within* their org. But **RLS is
  org-scoped, not brand-scoped** — every org member's RLS context permits all brands in the org.
  brand_access is therefore the *only* thing isolating brands inside an org, and it lives in
  `canPerform`, which only takes effect if a route **calls** it with the brandId. The existing
  brand-scoped routes (the S1–S7 `/api/brands/[id]/…` reads/actions) were built before org_members
  existed and **do not call canPerform** — and the S8 prompt wires canPerform only conceptually
  (§6.2) and into S8's own org-level routes, never into those brand routes (no retrofit, no
  brand-scoping middleware). As built, **brand_access is stored but unenforced**: a member
  restricted to brand A can still read/act on brand B via the un-retrofitted routes. The §11 test
  exercises canPerform's *logic* (null=all, array=restricted), not that the routes invoke it — so
  the gap isn't caught.
- **Why it matters (MODERATE):** it's a tenant-isolation/data-exposure gap in the feature whose
  entire purpose is access restriction, and it's silent (everything *looks* wired). The handoff C3
  expects brand_access honoured; today it's honourable but not enforced.
- **Required fix:** the prompt must specify *where* brand_access is enforced — either a
  brand-scoping helper/middleware that brand routes adopt (preferred: one `assertBrandAccess(user,
  brandId)` gate, with the S1–S7 brand routes listed as backward edits, exactly like the
  recordAction retrofit), or brand-level RLS — **or**, if data-read scoping is deliberately deferred,
  say so explicitly and flag that brand_access currently gates only the actions whose routes call
  canPerform (so it isn't mistaken for full isolation). Don't ship it looking complete but inert.

### S8b-02 — [LOW-MOD] No guard stops an admin from assigning the `owner` role (privilege escalation) — ESCALATE
- **Where:** §9 — "`PATCH …/members/[memberId]` — update role / brand_access (owner/admin)"; the
  RBAC matrix (LLD 8470-8480) has rows for invite/delete-brand but **none governing role
  assignment**.
- **The gap:** owner is strictly the most-privileged role (the matrix gives owner alone "Delete
  brand"; the schema notes owner = billing + org control). Yet the PATCH route lets *admin* update
  a member's role with no ceiling — so an admin can set role=`owner`, minting a peer who can delete
  brands/the org (or escalate a colluding account). Neither the LLD matrix nor the prompt bounds this.
- **Why it matters (LOW-MOD):** classic role-elevation-above-self; requires a semi-trusted admin
  actor, but a correct RBAC model must prevent it.
- **Required fix (LLD matrix + prompt):** only an owner may assign or revoke the `owner` role (and
  more generally, no one may elevate a role above their own). Add the rule to §0.5/§9 and recommend
  the matrix gain an explicit "Assign owner role | owner only" row.

### S8b-03 — [LOW-MOD] Privilege changes aren't audited — `member_role_changed`/`member_removed` exist in no action set — ESCALATE
- **Where:** the audit action enum — Phase 1 has `member_invited`, `brand_deleted`, `tier_changed`
  (LLD 8430); Phase 2 (AT-01) adds the 7 feature actions. **Neither set contains a role-change or
  member-removal action.**
- **The gap:** invitations and brand deletions are audited, but **changing a member's role or
  removing/deactivating a member is not** — the two most security-sensitive governance actions go
  unlogged. Compounds S8b-02: an admin escalating someone to owner would leave *no* audit trace.
- **Why it matters (LOW-MOD):** an audit trail that omits privilege changes is incomplete for a
  Privacy-Act/governance feature.
- **Required fix (LLD enum + prompt):** add `member_role_changed` and `member_removed` (resource_type
  `org_member`) to the action enum, and call recordAction on the PATCH (role/brand_access change)
  and DELETE/deactivate paths — i.e. these become audited sites alongside the existing 7.

### Note (not a finding) — invitation tokens never expire
The LLD deliberately chose **no `expires_at`** on invitations (manual cancel of unaccepted rows,
LLD ~8503). nanoid(21) is high-entropy so brute-force isn't the concern, but a leaked/forwarded
invite link is valid indefinitely until an admin cancels it. Worth a future hardening (a TTL, e.g.
7 days), but it's a conscious LLD decision, so I'm noting rather than flagging it.

---

## 4. CLEAN — verified this pass
- The v1.2 fixes (S8-01, S8-02, OQ-1, §1) are all correctly applied and surgical (additions only).
- Pass-1 CLEAN holds: the 4 table schemas verbatim; the 3-layer auth ordering; the fanout *spec* +
  retry-idempotency; RLS + barrel + the DR-01 writer; serve()=25/25; UI anchors; §1 enumeration.
- **Org-level isolation is sound** — RLS USING+WITH CHECK on organization_id (all 4 tables),
  setRlsContext on protected routes, cross-org→404. The fresh-angle gaps are about the *brand* and
  *role* sub-layers on top of org isolation, not org isolation itself.
- The invitation IC-01 lifecycle (single-use token, cancel-only-unaccepted) and the operator-only
  feature-flag write posture are correct.

---

## 5. NEXT STEP
Three model-level items (one security-MODERATE, two escalations) + the v1.2 fixes already landed:
- **S8b-01** — specify brand_access enforcement (a brand-scoping gate the S1–S7 brand routes adopt,
  or brand-level RLS), or explicitly scope+flag it; don't ship it inert. MODERATE.
- **S8b-02** — bound role assignment (only an owner assigns owner); LLD matrix + prompt. LOW-MOD.
- **S8b-03** — audit role changes + member removals (add the actions + recordAction sites); LLD
  enum + prompt. LOW-MOD.
S8b-02 + S8b-03 are quick and pair naturally (the same PATCH/DELETE routes). S8b-01 is the one to
decide deliberately — it's the difference between brand_access being a real isolation boundary or a
label. With these, Sprint 8 closes the governance layer properly; the wiring (v1.2) is already solid.

**Forward note for Sprint 9 (AI Visibility Autopilot UX — final sprint):** no new tables; it reads
S1–S8 and runs ONE end-to-end Autopilot loop (Audit → Prioritize → Explain → Execute → Measure) +
the Action Progress Tracker + Health Check banner + per-prompt trend API. Given this pass: if the
loop's "Execute" step performs brand-scoped actions, it should run through the *same* brand_access
gate from S8b-01 (so the Autopilot can't act outside a member's brands) — worth checking S9 doesn't
re-introduce the un-enforced path. After S9: the Gate-3 cross-prompt audit, then build.

— End of SPRINT8-FINDINGS-PASS2.md
