# DELIVER S9 CANON as FILES (not an artifact) — the reviewer chat can't open published artifacts

The published HTML artifact can't be read by the reviewer chat (no tool fetches claude.ai/code
artifact URLs; the Windows temp path isn't in its sandbox). Deliver the SAME content as plain
files or inline text instead — the channels the relay actually uses.

## Write the three sources to plain .md files
```bash
# S9 prompt — copy the real file verbatim:
cp <the-s9-prompt.md path> /mnt/user-data/outputs/S9-prompt.md    # e.g. sri-visibleau-sprint-9-prompt.md

# LLD S9 region — extract the Sprint 9 / autopilot sections to a file:
sed -n '9162,9270p' <current-LLD.md> > /mnt/user-data/outputs/S9-lld-autopilot.md
# plus the other cited sections (assertBrandAccess spec, explainability contract, honesty rule
# v8.27, autopilot backing v8.19) — append each range:
#   sed -n 'A,Bp' <LLD> >> /mnt/user-data/outputs/S9-lld-autopilot.md

# Prototype S9 components — extract the 3 (EnhancedDashboard, HealthCheck, AutopilotLoop):
#   sed -n 'A,Bp' <prototype.jsx> > /mnt/user-data/outputs/S9-prototype-screens.jsx
```
Then **attach those three files** to the next message (they'll land in /mnt/user-data/uploads where
the reviewer can read them). Do NOT publish as an artifact — attach as files, or paste as text.

## OR — just paste inline (simplest, proven all session)
Paste the three sources as TEXT across a few messages:
1. The full S9 prompt text.
2. The LLD S9/autopilot region text.
3. The prototype S9 component code + the context answers.

## The context answers I still need (paste these as text regardless)
1. **DB + data state:** confirmed `visibleau_prod`, and you said "sparse S9-relevant data" — spell
   out what EXISTS to walk: are there any autopilot runs? remediation_tasks rows? a computed
   health-check score for any brand? (An empty screen proves nothing — I need to know if there's
   real S9 data to view, or if we must generate some first, like the MISS FOX audit for S8.)
2. **The 5 reachable screens + routes** — list each (name + URL + tier gate), so the walk targets
   real URLs.
3. **The LLD version question** — you referenced v8.16 (prompt), v8.19/v8.27 (LLD sections), and I
   have v8.70. Clarify: is v8.70 the current full LLD, with v8.16/8.19/8.27 being per-feature
   revision tags INSIDE it? Or is there a different lineage? I need to know which document is
   authoritative for S9.
4. **The S9-02 prototype↔LLD mismatch** you annotated — what is it, in one line? (A known
   prototype-vs-LLD conflict is exactly the kind of thing that seeds a finding; I want it flagged
   up front.)

## Report back
Attach the 3 files (or paste the 3 sources inline) + the 4 context answers as text.
