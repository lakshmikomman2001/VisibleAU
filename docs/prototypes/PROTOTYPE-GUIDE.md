# Prototype guide: building Vunnara screens from the UI contract

Repo path: `docs/prototypes/PROTOTYPE-GUIDE.md` · version 1.1 · 21 Nov 2026 · read this before building any screen P01–P18.

## What's in `docs/prototypes/`

| File | What it is | How to use it |
|---|---|---|
| `vunnara-ui-config.ts` | **The UI contract (canonical).** Tokens, every component with every state, and for each screen: nodes, exact copy, data bindings, states, interactions, APIs, accessibility, responsive rules, acceptance checks. Also 24 resolved conflicts (C-01 to C-24) and decision D-UI1. | Read the `screens` entry for the screen you're building, top to bottom. It's documentation: nothing in `src/` imports it. |
| `client-enhancements-v2.html` | The visual, rendered from the same data. Each screen shows desktop (1240) and mobile (390) frames, every state, and the spec. Inspect mode (key **I**) measures any element and maps it back to tokens. | Open in a browser when you need to see layout. Every frame element carries `data-node="…"` equal to a node id in the contract. |
| `screens/*.png` | Static screenshots of each frame (desktop light, mobile light; dark for P00, P01, P02, P07, P08, P10). | Look at these with the Read tool instead of launching a browser. Compare your build against them. |
| `token-map.md` | Written by S00 Part 0b: every contract token and component mapped to the app's existing variable or component, with file:line. | Use it for every colour, type role and component. Never hard-code a hex value. |

Don't edit `vunnara-ui-config.ts`, the HTML or the PNGs. If something in them is wrong or can't be built, say so in your report with the change you propose; Sri and Claude (chat) update the contract and regenerate the HTML.

## Precedence (same as the contract's `precedence`)

1. Existing app code wins for anything that already exists: data, APIs, behaviour, and token values the app already defines. Report differences with file:line; never silently change existing screens.
2. For new UI, the contract wins over the HTML and over LLD prose.
3. The HTML wins over LLD prose for visual layout where the contract is silent.
4. Map, never duplicate. Only tokens with status `new` are added (S00 does that).
5. Copy is exact. `{placeholders}` are data. Don't reword.
6. A screen isn't done until every state in its `states` exists.
7. Flag off means today's app, exactly. Each screen's `flagOff` state says what that looks like.

## How to build one screen (the method)

1. **Read** `screens[Pxx]` in the contract and look at `screens/Pxx-*.png`.
2. **Map** each component and token it uses through `token-map.md`. Extend existing components (add a variant) rather than creating parallel ones.
3. **Build the nodes** in the order listed. Each node's `component`, `variant` and `style` say how it looks; `copy` says what it says; `bind` says where the data comes from; `showWhen` says when it renders (hidden means no empty gap); `behaviour` says what it does.
4. **Test ids.** Give every interactive node, and every node your tests assert on, `data-testid={testIdOf(node.id)}`: dots become dashes, camelCase becomes kebab (`P02.draftBar` → `p02-draft-bar`). The function is in the contract.
5. **States.** Build each entry in `states` (loading skeletons match the final layout; empty = one sentence + one action; errors in plain words with Retry; no-permission is read-only with who can change it; plan lock shows the plan marker and Upgrade).
6. **Interactions, API, accessibility, responsive** exactly as listed. The mobile frame in the HTML uses container queries so both widths fit on one page; implement with the app's viewport breakpoints from `token-map.md`.
7. **Verify** with targeted tests (component tests for states and copy; the Playwright specs mapped to the screen's files, one at a time, only with ≥ 6 GB free, else "not run: memory"; Playwright runs only in parts that change UI). Take screenshots of what you built at 1240 and 390 wide (light; also dark for P01, P02, P07, P10) into `.qa/screens/<sprint>/` (gitignored) and compare with `docs/prototypes/screens/`.
8. **Report** per screen, using the format below.

## Report format (per screen, in the sprint report-back)

```
P02 · Brand → Questions tab (S02 view mode)
Nodes: 9 of 13 built (P02.header.edit, P02.addQuestion, P02.draftBar, P02.row.weak: later sprints)
States: loading ✓ empty ✓ error ✓ noPermission ✓ flagOff ✓ (planLock, conflict, overLimit: S03)
Acceptance:
  ✓ View mode renders from one request; no N+1 per row (test: questions-tab.loader.test.ts)
  ✓ Sections follow reach order then "Names your business"
  ✗ … (reason, and what you propose)
Screenshots: .qa/screens/S02/P02-1240-light.png, P02-390-light.png, P02-1240-dark.png
Deviations from the contract: none | list each with reason and the contract change you propose
```

## Adding a new screen later (the template)

Every screen follows the `ScreenSpec` type in the contract: meta (`id`, `title`, `route`, `sprints`, `flags`, `frame`, `access`) → `layout` → `nodes` (each a `NodeSpec`: `id`, `component`, `variant`, `copy`, `bind`, `style`, `behaviour`, `a11y`, `showWhen`) → `states` → `interactions` → `api` → `a11y` → `responsive` → `acceptance` → `lld`. A new screen is specified by adding one more entry of that shape; the HTML is regenerated from it.
