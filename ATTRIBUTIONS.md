# VisibleAU — Attributions

Sprint 7 writes the first substantive entries (OSS reference layer for technical audit).

## OSS Reference Layer (Sprint 7)

VisibleAU's technical audit module (Sprint 7) was informed by the following OSS projects
and research publications. Per PRD §16 OSS-layer reference strategy: these are used as
**reference implementations** (MIT licence permits copying with attribution), not runtime
dependencies. All code is independently re-implemented with a 50-site validation corpus.

### Auriti-Labs/geo-optimizer-skill (MIT Licence)
- Source: https://github.com/Auriti-Labs/geo-optimizer-skill
- Used as reference for: 8-category scoring structure, 27 AI bot registry, 47 citability
  methods taxonomy, SARIF/JUnit/GHA output format concepts.
- Sprint 7 re-implements these independently with AU-localised Brand & Entity scoring.

### Princeton KDD 2024 — "GEO: Generative Engine Optimization"
- Authors: Allen et al. (2024). arXiv:2404.11973
- Used as reference for: 47 citability methods effect-size deltas.

### AutoGEO ICLR 2026
- Authors: AutoGEO team. ICLR 2026 workshop proceedings.
- Used as reference for: complementary citability methods (supplements Princeton KDD).

### Tinuiti — AI Citation Report Q1 2026
- Source: https://tinuiti.com/research/
- Used as reference for: Reddit 24% Perplexity citation share; Medium/Gemini preference.

### SE Ranking — AI Mode Citation Analysis (Dec 2025)
- Source: https://seranking.com/blog/ai-overviews-study/
- Used as reference for: FAQ schema impact data; schema richness scoring benchmarks.

### TEAM LEWIS — Earned Media GEO Study
- Source: https://teamlewis.com/research/
- Used as reference for: press mentions as GEO lever.

### Profound — LinkedIn AI Citation Surge
- Source: https://www.profound.com/research/
- Used as reference for: LinkedIn as emerging AI citation source.

## Webhook Integration Pattern (Sprint 8)

### Foglift (MIT Licence)
- Source: Referenced in PRD §16 OSS additions to Sprint 8
- Used as reference for: webhook event taxonomy (`audit.completed`, `audit.score.dropped`,
  `audit.score.changed`, `drift.detected`, `recommendation.created`) and 6-channel delivery
  pattern (Slack, Discord, Google Sheets, Airtable, Email, custom HTTP webhook).
- Sprint 8 independently implements all webhook infrastructure including HMAC-SHA256 signing,
  exponential backoff retry via Inngest, dead-letter endpoint disabling, and per-channel
  formatters (Block Kit for Slack, Embeds for Discord, flat JSON for Sheets/Airtable).

(Further attributions added in Sprints 9, 11, 12 per PRD §16 matrix.)
