/**
 * DISABLED — this script used to print every school admin's plaintext password.
 *
 * It read `generated_password` straight out of the database and wrote the
 * credentials to stdout, which is exactly the pattern that makes a single
 * database dump catastrophic.
 *
 * It is no longer needed and no longer works:
 *   - `generated_password` is cleared the moment the account first logs in, so
 *     it only exists between account creation and first use;
 *   - `password_history` now stores a one-way digest, never the password.
 *
 * Kept as a stub so nobody re-creates it by copy-paste.
 *
 * If you need to hand credentials to a new user, use the one-time reveal on the
 * school admin credentials screen (`/api/school-admin/teachers/credentials`),
 * which shows the value once, at creation, to the administrator who created it.
 */

console.error(
  "get_creds.js is disabled.\n" +
    "It previously dumped plaintext passwords, which is no longer stored.\n" +
    "Use the one-time credential reveal on the school admin screen instead.",
);

process.exit(1);
