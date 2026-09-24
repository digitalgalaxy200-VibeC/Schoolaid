/**
 * Refuse to run an operations script against the wrong database.
 *
 * WHY THIS EXISTS
 * ---------------
 * Six scripts in this folder pointed at PRODUCTION — three of them hardcoded, and
 * three that fell back to it silently when `SUPABASE_URL` was not set. That
 * fallback was not a rare edge case: the env files in this project define
 * `NEXT_PUBLIC_SUPABASE_URL`, not `SUPABASE_URL`, so the fallback was the NORMAL
 * path. `import_broadsheet.js` writes student scores, `migrate.js` creates users
 * and imports whole schools, and `reset_all_passwords.js` resets every password on
 * the platform.
 *
 * None of these can be triggered by an outsider. The risk is the ordinary
 * accident: an environment left pointing at production overnight, and the next
 * morning's command landing on live data. A guard turns that from an incident
 * into a refusal.
 *
 * THE RULE, IN ONE LINE
 * ---------------------
 *   Staging runs freely. Any other database must be named out loud, by ref.
 *
 * That is deliberately harder than a bare `--yes`: it cannot be muscle-memoried,
 * and it forces the operator to know which database they are naming.
 *
 * FAIL CLOSED
 * -----------
 * A target that cannot be determined at all is a refusal, not a pass. A script
 * that cannot say where it is pointing must not point anywhere.
 *
 * NOT A REPLACEMENT FOR CARE
 * --------------------------
 * This guards against the accident, not the decision. Whoever passes
 * `--confirm-target=<ref>` on purpose gets what they asked for. It is a seatbelt,
 * not a lock.
 */

/** The live platform. Nothing here should touch it without being told to. */
const PRODUCTION_REF = "iojiahkehnijxxczgrft";

/** The environment these scripts are meant to be pointed at. */
const STAGING_REF = "noyegdgrfzopfrwjunot";

/** `--confirm-target=<ref>` — the ref must be typed exactly. */
const CONFIRM_FLAG = "--confirm-target";

/**
 * Pulls a Supabase project ref out of whatever the caller has: a REST URL, a
 * direct database host, or a bare ref. Returns null when it cannot tell, which
 * the guard treats as a refusal.
 *
 * Supabase refs are exactly 20 lowercase alphanumeric characters, and every form
 * of the address embeds one: `https://<ref>.supabase.co`, or
 * `postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres`.
 */
function refFromUrl(value) {
  if (!value) return null;

  const text = String(value).trim();
  const embedded = text.match(/([a-z0-9]{20})\.supabase\./i);
  if (embedded) return embedded[1];

  return /^[a-z0-9]{20}$/i.test(text) ? text.toLowerCase() : null;
}

/**
 * Refuses unless the target is staging, or has been named explicitly.
 *
 * @param {object} options
 * @param {string|null} options.ref  The project ref this run would act on.
 * @param {string} options.action    What it would do, in plain words, e.g.
 *                                   "reset every user's password on". Used in the
 *                                   refusal so the message says what was
 *                                   prevented, not merely that something was.
 */
function guardDatabase({ ref, action }) {
  const what = action || "modify";

  if (!ref) {
    console.error(
      "REFUSING: could not work out which database this points at.\n" +
        "\n" +
        "  A script that cannot name its target must not run. Set the target\n" +
        "  variable explicitly (see this script's header) and try again.\n",
    );
    process.exit(1);
  }

  if (ref === STAGING_REF) {
    console.log(`▶ target: staging (${STAGING_REF})`);
    return;
  }

  const confirmation = `${CONFIRM_FLAG}=${ref}`;

  if (process.argv.includes(confirmation)) {
    console.warn(
      `\n${"!".repeat(72)}\n` +
        `!!  RUNNING AGAINST ${ref === PRODUCTION_REF ? "PRODUCTION" : ref}\n` +
        `!!  This run will ${what} that database.\n` +
        `${"!".repeat(72)}\n`,
    );
    return;
  }

  console.error(
    `REFUSING: this script would ${what} ${
      ref === PRODUCTION_REF ? `PRODUCTION (${PRODUCTION_REF})` : `the database ${ref}`
    }.\n` +
      "\n" +
      "  Nothing has been sent.\n" +
      "\n" +
      "  If this is genuinely what you want, name the target out loud by\n" +
      "  re-running with the ref exactly as written below:\n" +
      "\n" +
      `      ${confirmation}\n`,
  );
  process.exit(1);
}

module.exports = {
  PRODUCTION_REF,
  STAGING_REF,
  CONFIRM_FLAG,
  refFromUrl,
  guardDatabase,
};
