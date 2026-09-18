# Lint backlog

Record of the 2026-09-19 Biome re-baseline, for a later cleanup sprint. Nothing here blocks launch —
`pnpm typecheck` and `pnpm build` are green; these are `pnpm lint` (Biome) findings only, and Vercel
does not run `pnpm lint` as part of the build.

## What changed and why

The prior full-repo scan reported 4838 diagnostics, but 3020 of them (99.6% of
`noAssignInExpressions`, 99.8% of `noCommaOperator`) were one file:
`tests/qa/sprint10/tests/qa/sprint10/reports/index.html`, a generated Playwright HTML test report
(530KB, minified bundle) that was never git-tracked (already covered by `.gitignore`'s
`tests/qa/**/reports/` line) but was still being scanned because `biome.json` had no `vcs` config
telling Biome to respect `.gitignore`, and its `files.includes` explicitly listed `tests/**`.

Fixed in `biome.json` by adding both:
1. `"vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true }` — makes `.gitignore` the
   source of truth for what Biome should never see.
2. Three negated globs in `files.includes` — `!tests/qa/**/reports/**`, `!**/playwright-report/**`,
   `!**/test-results/**` — belt-and-braces exclusion in case a future report ever gets tracked, added
   or un-ignored.

## Before / after

| | files checked | errors | warnings | infos | total diagnostics |
|---|---|---|---|---|---|
| Before | (not tracked precisely; dominated by 1 file) | — | — | — | 4838 |
| After | 1126 | 191 | 314 | 257 | **762** |

`noAssignInExpressions`: 1885 → 7 (the genuine hits in real source, unaffected by this change).
`noCommaOperator`: 1135 → 2 (same).

## Rule table (all 33 rules, post-exclusion)

Disposition determined empirically: ran `biome check --write` (safe fixes only) and separately
`biome check --write --unsafe` (safe + unsafe fixes) against an isolated git worktree copy of the
post-exclusion config, and diffed the remaining diagnostic count per rule against the baseline.
Nothing was written to the real working tree to produce this table.

| count | rule | disposition |
|---|---|---|
| 160 | `lint/style/useNodejsImportProtocol` | mechanical — fixable with `--unsafe` |
| 144 | `lint/suspicious/noExplicitAny` | needs-human (no autofix; requires real types) |
| 80 | `lint/correctness/noUnusedImports` | mechanical — fixable with `--unsafe` |
| 70 | `lint/a11y/useButtonType` | needs-human (no autofix; must pick button vs submit) |
| 62 | `lint/style/useTemplate` | mechanical — fixable with `--unsafe` |
| 40 | `lint/suspicious/noArrayIndexKey` | needs-human (no autofix; needs a stable key) |
| 33 | `lint/correctness/noUnusedVariables` | mixed — 29/33 fixable with `--unsafe`, 4 need-human |
| 29 | `lint/complexity/useLiteralKeys` | mechanical — fixable with `--unsafe` |
| 26 | `lint/a11y/noLabelWithoutControl` | needs-human (no autofix; needs a real `htmlFor`/wrapping) |
| 15 | `lint/complexity/noBannedTypes` | needs-human (no autofix; needs a real replacement type) |
| 11 | `lint/correctness/noUnusedFunctionParameters` | mixed — 2/11 fixable with `--unsafe`, 9 need-human |
| 11 | `lint/correctness/useExhaustiveDependencies` | mixed — 6/11 fixable with `--unsafe`, 5 need-human (never blindly trust the auto-added deps here — verify each) |
| 10 | `lint/a11y/useSemanticElements` | needs-human (no autofix) |
| 8 | `lint/complexity/useOptionalChain` | mechanical — fixable with `--unsafe` |
| 8 | `lint/complexity/noStaticOnlyClass` | needs-human (no autofix; needs a refactor to functions) |
| 7 | `lint/suspicious/noAssignInExpressions` | needs-human (no autofix) — the real, non-report hits |
| 5 | `lint/correctness/useParseIntRadix` | mechanical — fixable with `--unsafe` |
| 5 | `lint/suspicious/noGlobalIsNan` | mechanical — fixable with `--unsafe` |
| 4 | `lint/a11y/noStaticElementInteractions` | needs-human (no autofix) |
| 4 | `lint/suspicious/noImplicitAnyLet` | needs-human (no autofix) |
| 4 | `lint/a11y/noSvgWithoutTitle` | needs-human (no autofix; needs a real title) |
| 4 | `lint/suspicious/useIterableCallbackReturn` | needs-human (no autofix) |
| 3 | `lint/performance/noImgElement` | needs-human (no autofix; migrate to `next/image` deliberately) |
| 3 | `lint/suspicious/useBiomeIgnoreFolder` | mechanical — fixable with safe `--write` |
| 3 | `lint/a11y/useKeyWithClickEvents` | needs-human (no autofix) |
| 2 | `lint/complexity/noCommaOperator` | needs-human (no autofix) — the real, non-report hits |
| 2 | `lint/suspicious/noApproximativeNumericConstant` | mechanical — fixable with `--unsafe` |
| 2 | `lint/a11y/useFocusableInteractive` | needs-human (no autofix) |
| 2 | `lint/a11y/useAriaPropsSupportedByRole` | needs-human (no autofix) |
| 2 | `lint/correctness/noChildrenProp` | needs-human (no autofix) |
| 1 | `lint/complexity/useIndexOf` | mechanical — fixable with `--unsafe` |
| 1 | `lint/suspicious/noShadowRestrictedNames` | needs-human (no autofix) |
| 1 | `lint/suspicious/noThenProperty` | needs-human (no autofix) |

## Suggested next pass

The 9 "mechanical — fixable with `--unsafe`" rules (`useNodejsImportProtocol`, `noUnusedImports`,
`useTemplate`, `useLiteralKeys`, `useOptionalChain`, `useParseIntRadix`, `noGlobalIsNan`,
`useBiomeIgnoreFolder`, `noApproximativeNumericConstant`, plus the mechanical share of
`noUnusedVariables`/`noUnusedFunctionParameters`/`useExhaustiveDependencies`) account for roughly
392 of the 762 remaining diagnostics and can likely be cleared in one `biome check --write --unsafe`
pass followed by `pnpm typecheck && pnpm build` — but "unsafe" means Biome itself isn't certain the
fix preserves behavior, so that pass needs a full review of the diff before committing, not a blind
apply. The remaining ~370 "needs-human" diagnostics (dominated by `noExplicitAny`, `useButtonType`,
`noArrayIndexKey`, `noLabelWithoutControl`) are real code-quality debt requiring individual judgment
calls and are out of scope for a mechanical pass.
