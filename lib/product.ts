/**
 * The product's name wherever it's printed for a client: the report PDF's
 * running header and "Powered by", the email layout, and the words on the
 * sign-in, sign-up and invite pages (team follow-ups, item 8; their "visible
 * au" logo waits for the rebrand). One constant, never a literal -- the report
 * PDF said "VisibleAU" for weeks after the product became Vunnara
 * (DEMO-BLOCKER, 1 Nov).
 */
export const PRODUCT_NAME = "Vunnara";

/**
 * Regression follow-ups (9 Nov), parts 4 and 6 -- the public site's address: the base every page's metadata
 * resolves against (metadataBase: canonical links, Open Graph and Twitter images), and every public URL the
 * product prints. Fixed, not read from the environment: a preview or local build still names the production
 * site as canonical, never itself. Pages pointed at the product's old domain, and anything relative fell back to
 * http://localhost:3000 (the build's metadataBase warning).
 */
export const SITE_DOMAIN = "vunnara.com.au";
export const SITE_URL = `https://${SITE_DOMAIN}`;

/**
 * Mock-gate and retention follow-ups (9 Nov), part 8 -- every contact address is on the domain the app sends from
 * (lib/email/send.ts ALLOWED_FROM_DOMAINS), from these constants, never a literal. They were hello, hi, support
 * and privacy at the product's old domain, while every email came from vunnara.com.au. The three mailboxes
 * must exist before this ships.
 */
export const CONTACT_DOMAIN = SITE_DOMAIN;
/** General enquiries, Enterprise sales and the footer. */
export const CONTACT_EMAIL = `hello@${CONTACT_DOMAIN}`;
/** Something went wrong in the app. */
export const SUPPORT_EMAIL = `support@${CONTACT_DOMAIN}`;
/** Privacy requests: access, correction, deletion. */
export const PRIVACY_EMAIL = `privacy@${CONTACT_DOMAIN}`;

/**
 * Playwright-run follow-ups (10 Nov), part 7 -- the business behind Vunnara. Sri, 10 Nov: a sole trader, not
 * the company the Terms and the footer named. Every page that shows a legal name renders these:
 * the Terms, the privacy page and the footer (tests/unit/legal/legal-entity.test.tsx checks).
 *
 * Sri, 11 Nov: the business is "Vunnara", ABN 35 523 139 837, and no personal name appears anywhere. The
 * footer, the Terms and the privacy page name the business by these constants and nothing else (the same
 * test renders them and checks). A production build still stops if either is ever a "[...]" placeholder or
 * the ABN fails its check digits (next.config.ts, assertLegalEntityForProduction).
 */
export const LEGAL_ENTITY_NAME = "Vunnara";
export const LEGAL_ABN = "35 523 139 837";

/** The ATO's ABN check: subtract 1 from the first digit, weight the 11 digits, and the sum divides by 89. */
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
export function abnCheckDigitsValid(abn: string): boolean {
  const digits = abn.replace(/ /g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const sum = [...digits].reduce(
    (total, digit, i) => total + (Number(digit) - (i === 0 ? 1 : 0)) * ABN_WEIGHTS[i],
    0,
  );
  return sum % 89 === 0;
}

/** Both hold real values: a name that isn't a "[...]" placeholder, and an 11-digit ABN that passes its check. */
export function legalEntityIsSet(
  name: string = LEGAL_ENTITY_NAME,
  abn: string = LEGAL_ABN,
): boolean {
  return (
    name.trim().length > 0 &&
    !name.trim().startsWith("[") &&
    /^\d{2} ?\d{3} ?\d{3} ?\d{3}$/.test(abn.trim()) &&
    abnCheckDigitsValid(abn.trim())
  );
}

/** next.config.ts: a production build (VERCEL_ENV=production) stops while the legal name or ABN is a placeholder. */
export function assertLegalEntityForProduction(
  env: Record<string, string | undefined> = process.env,
  name: string = LEGAL_ENTITY_NAME,
  abn: string = LEGAL_ABN,
): void {
  if (env.VERCEL_ENV === "production" && !legalEntityIsSet(name, abn)) {
    throw new Error(
      "LEGAL_ENTITY_NAME and LEGAL_ABN in lib/product.ts aren't set: the business name and a valid 11-digit ABN must be there before a production build.",
    );
  }
}

/**
 * The bot a site check identifies as (lib/crawler/index.ts), with the page that says what it is: a site owner
 * who sees it in their logs reads it at /about. Renamed from VisibleAU-Audit-Bot on 10 Nov (Sri).
 */
export const CRAWLER_NAME = "Vunnara-Audit-Bot";
export const CRAWLER_USER_AGENT = `${CRAWLER_NAME}/1.0 (+${SITE_URL}/about)`;

/**
 * The AI-crawler tracking snippet a site installs (public/vunnara-snippet.js). Renamed from visibleau-snippet.js
 * on 10 Nov (Sri); the old path still serves the same file (next.config.ts rewrites it), so an installed copy
 * keeps working. Both are public routes (middleware.ts).
 */
export const TRACKING_SNIPPET_PATH = "/vunnara-snippet.js";
export const LEGACY_TRACKING_SNIPPET_PATH = "/visibleau-snippet.js";
