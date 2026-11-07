/**
 * Follow-ups from d247ba7..f13411d, part 3 -- the one password rule, for every way an account gets a
 * password: better-auth's own check for sign-up and reset reads these numbers (lib/auth/server.ts), the
 * invite sign-up checks passwordProblem (app/api/invites/[orgId]/[token]/sign-up/route.ts), and the forms
 * say the same. No imports: the forms read it too.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_RULE = `Use a password of ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`;

/** What's wrong with `password` by the rule, or null when it meets it. */
export function passwordProblem(password: string): string | null {
  return password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH
    ? PASSWORD_RULE
    : null;
}
