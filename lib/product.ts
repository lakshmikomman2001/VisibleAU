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
 * Mock-gate and retention follow-ups (9 Nov), part 8 -- every contact address is on the domain the app sends from
 * (lib/email/send.ts ALLOWED_FROM_DOMAINS), from these constants, never a literal. They were hello, hi, support
 * and privacy at the old visibleau.com domain, while every email came from vunnara.com.au. The three mailboxes
 * must exist before this ships.
 */
export const CONTACT_DOMAIN = "vunnara.com.au";
/** General enquiries, Enterprise sales and the footer. */
export const CONTACT_EMAIL = `hello@${CONTACT_DOMAIN}`;
/** Something went wrong in the app. */
export const SUPPORT_EMAIL = `support@${CONTACT_DOMAIN}`;
/** Privacy requests: access, correction, deletion. */
export const PRIVACY_EMAIL = `privacy@${CONTACT_DOMAIN}`;
