/**
 * Vunnara Build 1, Part B — proves the plpgsql function embedded in
 * diag-0072-branded-flag-mismatch.sql / 0073-branded-flag-correction-
 * *.sql (db/prod-fixes/) produces EXACTLY the same verdict as the real
 * TS function, lib/audit/flag-branded-prompts.ts's isBrandedPrompt, on
 * a varied fixture set: quotes, markdown bold, possessives (both
 * forms), hyphenated, all-caps, a longer word sharing the same prefix,
 * a different word, {domain}-only, "and"/"&", a too-short domain stem,
 * and a leading-space brand name. Without this, the prod-fix files
 * could silently drift from the TS rule they're meant to mirror.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let client: ReturnType<typeof postgres>;

// Exactly the function body embedded in every db/prod-fixes/*0072*.sql
// and *0073*.sql file -- keep these in sync; this test is what proves
// they still agree with the TS function after any edit.
const FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION pg_temp.is_branded_prompt_text(prompt_text text, brand_name text, brand_domain text)
RETURNS boolean AS $$
DECLARE
  words text[];
  escaped_words text[];
  w text;
  body text;
  pattern text;
  stem text;
  stripped_prompt text;
BEGIN
  words := string_to_array(btrim(regexp_replace(brand_name, '\\s+', ' ', 'g')), ' ');
  escaped_words := ARRAY[]::text[];
  FOREACH w IN ARRAY words LOOP
    IF lower(w) = 'and' THEN
      escaped_words := array_append(escaped_words, '(?:and|&)');
    ELSE
      escaped_words := array_append(
        escaped_words,
        regexp_replace(w, '([.^$*+?()\\[\\]{}|\\\\])', '\\\\\\1', 'g')
      );
    END IF;
  END LOOP;
  body := array_to_string(escaped_words, '[\\s\\-\\u2013\\u2014&''\\u2019.]*');
  pattern := '(?:^|[^[:alnum:]])' || body || '(?:[''\\u2019]s?)?(?:$|[^[:alnum:]])';

  IF prompt_text ~* pattern THEN
    RETURN true;
  END IF;

  stem := lower(regexp_replace(regexp_replace(lower(btrim(brand_domain)), '^https?://', ''), '[^a-z0-9.]', '', 'g'));
  stem := regexp_replace(stem, '\\.(com\\.au|net\\.au|org\\.au|com|net|org|io|co)+$', '');
  stem := regexp_replace(stem, '[^a-z0-9]', '', 'g');
  IF length(stem) < 4 THEN
    RETURN false;
  END IF;
  stripped_prompt := regexp_replace(lower(prompt_text), '[^a-z0-9]', '', 'g');
  RETURN stripped_prompt LIKE '%' || stem || '%';
END;
$$ LANGUAGE plpgsql IMMUTABLE;
`;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  client = postgres(url, { max: 1 });
  await client.unsafe(FUNCTION_SQL);
});

afterAll(async () => {
  await client.end();
});

async function sqlVerdict(promptText: string, name: string, domain: string): Promise<boolean> {
  const [row] = await client`
    SELECT pg_temp.is_branded_prompt_text(${promptText}, ${name}, ${domain}) AS result
  `;
  return row.result as boolean;
}

const CASES: Array<{ label: string; text: string; name: string; domain: string }> = [
  {
    label: "direct mention",
    text: "Is Omega Services popular in Australia?",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "enriched 'alternatives' prompt",
    text: "What are the best alternatives to Omega Services in Australia?",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "intentSignal-derived prompt (organic, no brand mention)",
    text: "Best 24 hour plumber Sydney for Australian businesses?",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "another intentSignal-derived prompt (organic)",
    text: "Best hot water system repair for Australian businesses?",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "quoted mention",
    text: '"Omega Services" is a great choice.',
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "markdown-bolded mention",
    text: "**Omega Services** is a great choice.",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "trailing possessive, bare apostrophe (name already ends in s)",
    text: "Omega Services' reputation is strong.",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "trailing possessive, 's",
    text: "Omega's reputation is strong.",
    name: "Omega",
    domain: "omega-services.com.au",
  },
  {
    label: "hyphenated variant",
    text: "Omega-Services offers 24/7 support.",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "all-caps",
    text: "OMEGA SERVICES is well regarded.",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "longer word sharing the same prefix (must not match)",
    text: "Omegaservicesx is a different company.",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "a different word (must not match)",
    text: "Omega Servicing does plumbing repairs.",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "{domain}-only template",
    text: "Visit omega-services.com.au for a free quote.",
    name: "Omega Services",
    domain: "omega-services.com.au",
  },
  {
    label: "deterministic category-template prompt (organic)",
    text: "Best plumbers in Sydney CBD for emergency repairs?",
    name: "Bondi Plumbing",
    domain: "bondiplumbing.com.au",
  },
  {
    label: "'&' standing in for 'and'",
    text: "Smith & Jones Plumbing are recommended.",
    name: "Smith and Jones Plumbing",
    domain: "smithjones.com.au",
  },
  {
    label: "literal 'and' in the name",
    text: "Smith and Jones Plumbing are recommended.",
    name: "Smith and Jones Plumbing",
    domain: "smithjones.com.au",
  },
  {
    label: "domain stem under 4 chars is ignored",
    text: "Check ab for details.",
    name: "AB Co",
    domain: "ab.com.au",
  },
  {
    label: "a leading-space stored brand name",
    text: "Is Bondi Plumbing a reputable tradesperson?",
    name: " Bondi Plumbing",
    domain: "bondiplumbing.com.au",
  },
  {
    label: "a name containing a regex metacharacter, matched literally",
    text: "A+ Plumbing is great.",
    name: "A+ Plumbing",
    domain: "aplusplumbing.com.au",
  },
  {
    label: "a name containing a regex metacharacter, must not match a lookalike",
    text: "AX Plumbing is different.",
    name: "A+ Plumbing",
    domain: "aplusplumbing.com.au",
  },
];

describe("SQL/TS parity: pg_temp.is_branded_prompt_text mirrors isBrandedPrompt exactly", () => {
  for (const { label, text, name, domain } of CASES) {
    it(`${label}: "${text}"`, async () => {
      const tsResult = isBrandedPrompt(text, { name, domain });
      const sqlResult = await sqlVerdict(text, name, domain);
      expect(sqlResult).toBe(tsResult);
    });
  }
});
