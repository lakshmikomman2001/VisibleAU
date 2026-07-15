# EXTRACT S9 LLD REGIONS — into one file to upload (don't paste the whole LLD)

The reviewer needs specific LLD regions the S9 prompt defers to ("the LLD wins on conflict"), not the
whole document. Extract them to one file and upload it (or paste inline). The prompt cites these
anchors (line numbers are navigational — confirm by content; the region matters, not the exact line).

## First, confirm the version + find the real line numbers
```bash
cd "C:/startup/VisibleAU/src/docs/latets/Phase2/Claude/Sprints/Execution-Final"
grep -m1 '# Version:' visibleau-7layer-lld.md    # is it 8.68? 8.69? 8.70? — tell me which
wc -l visibleau-7layer-lld.md
# Locate each cited region by CONTENT (the ~line numbers drift):
grep -nE "Action Progress Tracker|score_after|FILTER \(WHERE score_after|lift_achieved" visibleau-7layer-lld.md | head
grep -nE "v8.16|citations.brand_id|JOIN audits|trend.*query|per-prompt trend" visibleau-7layer-lld.md | head
grep -nE "Health Check|cross-layer|AI SENTIMENT|AI PRESENCE|SITE READINESS|LOCAL AUTHORITY|green.*amber.*red" visibleau-7layer-lld.md | head
grep -nE "explainability|ExplainabilityService|rendered.*not.*regenerat|annotate\(" visibleau-7layer-lld.md | head
grep -nE "Autopilot.*loop|loop.*step|5-step|Prioritize.*Explain.*Execute" visibleau-7layer-lld.md | head
grep -nE "assertBrandAccess|S8b-01" visibleau-7layer-lld.md | head
```

## Extract these regions to one file
Use the real line numbers from above (pad each range generously — ±20 lines):
```bash
OUT=/mnt/user-data/outputs/S9-LLD-regions.md
echo "# S9 LLD REGIONS (from visibleau-7layer-lld.md v____)" > $OUT
echo "## Version line:" >> $OUT
grep -m1 '# Version:' visibleau-7layer-lld.md >> $OUT

echo -e "\n## 1. Action Progress Tracker + the honesty query (score_after FILTER, lift_achieved) [~9060, 7824]" >> $OUT
sed -n 'A,Bp' visibleau-7layer-lld.md >> $OUT     # the tracker region
sed -n 'C,Dp' visibleau-7layer-lld.md >> $OUT     # the score_after honesty query region (~7824)

echo -e "\n## 2. Per-prompt trend + v8.16 JOIN fix [~9075]" >> $OUT
sed -n 'E,Fp' visibleau-7layer-lld.md >> $OUT

echo -e "\n## 3. Health Check — 4 cross-layer dimensions + green/amber/red thresholds [~9060-9090]" >> $OUT
sed -n 'G,Hp' visibleau-7layer-lld.md >> $OUT

echo -e "\n## 4. Explainability contract (rendered, not regenerated) [~5556]" >> $OUT
sed -n 'I,Jp' visibleau-7layer-lld.md >> $OUT

echo -e "\n## 5. Autopilot-loop step backing [~802]" >> $OUT
sed -n 'K,Lp' visibleau-7layer-lld.md >> $OUT

echo -e "\n## 6. assertBrandAccess / S8b-01 formalization [~8635-8646]" >> $OUT
sed -n 'M,Np' visibleau-7layer-lld.md >> $OUT

echo -e "\n## 7. Sprint 9 plan region (the whole ~9050-9090)" >> $OUT
sed -n 'O,Pp' visibleau-7layer-lld.md >> $OUT

wc -l $OUT
```
Then **upload `/mnt/user-data/outputs/S9-LLD-regions.md`** (or paste it inline).

## Also answer (paste as text)
- The LLD version (8.68 / 8.69 / 8.70?) — the START file said 8.68, the prompt was built vs 8.69,
  you said 8.70 authoritative. Which does the actual file say NOW? If there's a v8.69→v8.70 delta
  touching S9, note it.

## Report back
- Upload `S9-LLD-regions.md` (the 7 extracted regions).
- The version answer.
