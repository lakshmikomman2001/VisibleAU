# FIX Gate 3 F-7 [MED] — Parameterize journey templates (stop hardcoding vertical + city)

## The bug
`db/seed/prebuilt-journeys.ts` hardcodes literal vertical + city strings — *"top electricians in
Melbourne"*, *"best plumbers in Sydney"* (lines ~17, 39, 120, 131). Every brand that uses a prebuilt
journey gets **someone else's vertical and someone else's city.** A dental practice in Perth sees
"electricians in Melbourne."

⚠️ **This is an ACTIVE canon violation.** S7's own spec mandates *"3 pre-built journeys per vertical"* —
i.e. journeys **parameterized to the brand**, not frozen to one example. And Gate 3's rule: *"nothing
one sprint defers is left unbuilt by its owner"* — S7 owns this and never built it. **It's also
customer-visible**, which most of our findings aren't.

**Decision: parameterize per-brand** (vertical + city from the brand), not merely neutralize the
strings.

## Task
```bash
cd c:/startup/VisibleAU/src
cat db/seed/prebuilt-journeys.ts
# What does a brand carry for vertical + location?
grep -rn "vertical\|industry\|city\|location\|region\|suburb" db/schema/brands.ts
# How are journeys instantiated for a brand? (seed-time constant, or per-brand at runtime?)
grep -rn "prebuilt.*journey\|prebuiltJourney\|journey.*template" lib/ app/ --include=*.ts | head
```
1. **Establish the brand's fields.** What does a brand actually store — `vertical`? `city`/`suburb`?
   A free-text location? **Report the exact fields available**, because the templating can only use
   what exists.
2. **Replace the hardcoded strings with placeholders** resolved from the brand:
   - `"top electricians in Melbourne"` → `` `top ${brand.vertical} in ${brand.city}` `` (or the real
     field names).
3. ⚠️ **Decide WHERE resolution happens** — and report it:
   - If journeys are **instantiated per-brand at runtime**, resolve there (the seed holds templates
     with placeholders).
   - If they're **seeded as static rows**, the seed can't know the brand — then the *template* must
     carry placeholders and the **read/instantiation path** must interpolate. **Don't bake a brand's
     values into a shared seed row.**
4. **Handle missing fields:** a brand with no `city`, or an unknown `vertical` → the template must
   degrade gracefully (drop the location clause, or use a neutral fallback like "your area") — **never
   render a literal `${brand.city}` or the word "undefined".**

## Break-proof
```
- Brand A (dentist, Perth)   → journey reads "...dentists in Perth"
- Brand B (plumber, Brisbane)→ journey reads "...plumbers in Brisbane"
- Brand C (no city set)      → journey reads a graceful fallback, NOT "${brand.city}" / "undefined"
- grep: db/seed/prebuilt-journeys.ts contains NO literal "Melbourne"/"Sydney"/"electricians"/"plumbers"
        as journey text (RED if a hardcoded city/vertical returns)
```
⚠️ **Brand C is the one that breaks naive fixes** — test the missing-field path explicitly.

## Constraints
- Parameterize; do **not** just swap one hardcoded city for another.
- **Never** emit a raw placeholder (`${brand.city}`) or "undefined" to a user.
- Resolution must happen where the brand is known — not baked into a shared seed row.
- Add the grep guard so a future hardcoded city/vertical goes RED.

## Report back
1. **The brand's actual fields** for vertical + location (exact names).
2. **Where resolution happens** (seed-time vs runtime instantiation) and why.
3. ⚠️ **Brand C (missing field):** what renders? (Must be graceful, not `undefined`.)
4. The grep guard + its re-break.
