# VisibleAU — Sprint 7 UI fix: SSR check homepage row label
# Page: /brands/[brandId]/ssr-check  (prototype: SsrCheck, line 2908)
# Source: Gate-2 SSR-page review. Severity: LOW / cosmetic (page otherwise passed).
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> In the SSR check page's page-by-page table (`/brands/[brandId]/ssr-check`), the homepage row renders
> the bare path `/`. The prototype `SsrCheck` labels it **`/ (homepage)`**. Match the prototype.
>
> Change: when rendering a row whose path is `/`, display **`/ (homepage)`** instead of `/`. This is a
> display-side format only — do NOT change the stored value (`findings.content.ssr.pages[0].path` stays
> `/`), the row ordering, the mono styling, or any other row. All non-homepage rows keep their literal
> path unchanged.
>
> Verify before reporting done:
> - The first row reads `/ (homepage)`.
> - Every other row's path is unchanged (e.g. `/emergency-plumber-bondi`, `/contact-us`).
> - `findings.content.ssr.pages[0].path` is still `/` (display-only change, no data mutation).
> - Mono font and all other columns/styling unchanged; both light and dark themes.
>
> Report the file changed.
