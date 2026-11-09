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
