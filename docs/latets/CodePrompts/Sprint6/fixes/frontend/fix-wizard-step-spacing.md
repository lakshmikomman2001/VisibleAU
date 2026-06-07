# Claude Code — fix step-subtitle spacing in the Add-brand wizard

In the Add-brand wizard (`/brands/wizard`), the step subtitle currently renders as **"Step 1of 4"** — there is a missing space between the step number and "of". Fix the template so it reads **"Step {step} of 4 · ~3 minutes total"** (a normal space on both sides of "of"), matching the prototype's `BrandSetupWizard`.

One-character change: `Step {step}of 4` → `Step {step} of 4`.
