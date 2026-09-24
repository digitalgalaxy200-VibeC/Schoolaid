# `scripts/`

Operations scripts, run **by hand**. Nothing in this folder is wired to an npm
script, so nothing here runs unless someone deliberately types the command.

---

## The one rule: staging is free, any other database must be named

`lib/db-guard.js`. A script that touches a database calls it before doing anything
at all:

```
Staging runs freely. Any other database must be named out loud, by ref.
```

| Target | What happens |
| --- | --- |
| `noyegdgrfzopfrwjunot` (staging) | Runs, after printing `▶ target: staging` |
| `iojiahkehnijxxczgrft` (production) | **Refuses** unless you pass `--confirm-target=iojiahkehnijxxczgrft` |
| Any other database | **Refuses**; the same flag names it |
| A target that cannot be worked out | **Refuses.** A script that cannot name its target must not point anywhere |

The override is the full ref rather than a bare `--yes` on purpose: it cannot be
muscle-memoried, and it forces whoever runs it to know which database they named.

**Why it exists.** Six of the scripts that used to live here pointed at production
— three hardcoded, and three that fell back to it silently when `SUPABASE_URL` was
unset, which was the *normal* path because the env files define
`NEXT_PUBLIC_SUPABASE_URL`, not `SUPABASE_URL`. None of it was reachable by an
outsider; the risk was an environment left pointing the wrong way overnight, and
the next morning's command landing on live data.

**The guard currently has no callers** — every script it was added to has since
been removed (see below). It stays because it is the *rule for this folder*: the
first line of any script added here that touches a database.

---

## What was removed, on 2026-09-24, and how to bring any of it back

Nothing here was broken. Several of these worked perfectly against the wrong
database, which was the problem.

| Removed | What it did | Why it went |
| --- | --- | --- |
| `reset_all_passwords.js` | Set **every account on the platform** to the password `school123` | One known password for every school, teacher and student |
| `import_broadsheet.js` | Deleted a school's scores for a term, then imported a spreadsheet into it | Ran against production by default, and it deletes before it writes |
| `migrate.js` | Moved the old system's data in from a `backup.sql`: created user accounts, imported schools, sessions, terms, classes, subjects, staff, students and scores. Also wrote the generated logins to a file | The one-off move onto this platform; finished if that migration is done |
| `run-migration.js` | Built a brand-new empty database over a direct connection (`001_initial_schema.sql` + `seed.sql`) | Finished; it never applied the later migrations |
| `run-migration-api.js` | The same bootstrap, through the REST API | Finished |
| `query_db.ts` | Ad-hoc look-up: find a school by name and print it | Could not run at all — this repo ships no `tsx` and no `ts-node` |
| `api/super-admin/bulk-reset-passwords/route.ts` | Set every teacher and student in one school to `school123` | Same one-password weakness, reachable through the API |
| `api/super-admin/bulk-reset-students/route.ts` | Set every student in a school to `<SCHOOLNAME><SCHOOLNAME><SCHOOLNAME>123` | The password was derivable from the school's own name, so a student could work out another student's |

### To restore any of them

They are all still in git. `9a31091` is the last commit that contained every one
of them:

```bash
git show 9a31091:scripts/import_broadsheet.js > scripts/import_broadsheet.js

# or find it yourself
git log --oneline -- scripts/import_broadsheet.js
```

Use the same shape with any of the paths above. **What comes back is the guarded
version** for the scripts — they were guarded the same day, before being removed,
so a restored script still refuses production until the target is named.

### If you do bring one back

- **`import_broadsheet.js`** — the likely one, for onboarding a school that sends
  marks in a spreadsheet. Point it at **staging** first, and read the "clearing
  existing scores" line before letting it near a term whose results matter.
- **The two bulk password routes** — if the capability is wanted again, the right
  shape already exists: `generateUniquePassword()` in `src/lib/password.ts`, which
  every other reset route already uses and which gives each person a *different*
  password.
- **`migrate.js`** — the only one here whose work would be hard to redo by hand.

---

## What is still in this folder

| File | Notes |
| --- | --- |
| `lib/db-guard.js` | The rule above. No callers today; required by anything new |
| `which-env.js` | Reports which project `.env.local` points at. **Untracked** — the register's T5 |
| `isolation-test.cjs`, `rls-isolation-test.cjs`, `tenant-baseline-check.js` | The tenant-isolation harnesses, wired to npm (`test:isolation`, `test:rls`, `test:baseline`). Aimed at staging |
| `setup-staging.js`, `setup-staging-full.js` | Staging setup |
| `list-schools.js`, `fix_admins.js`, `backfill_usernames.js`, `provision-admin.mjs`, `extract_class_teachers.js` | Ad-hoc helpers that reach a database through the service-role key |
| `get_creds.js` | A **disabled stub**. It used to print every school admin's plaintext password; it is kept only so nobody recreates it by copy-paste. See register D6 |
| `reset_still_waters_admin.sql` | A one-off data fix |

### ⚠️ Two follow-ups this cleanup surfaced

1. **`run_mig.js` and `run-seed.js` are from the same migration family** and were
   not in the approved removal list, so they are still here.
   - `run_mig.js` connects to `postgresql://postgres:password@localhost:5432` — a
     **local** Postgres that no longer exists on this machine.
   - `run-seed.js` targets project ref **`acxgfhvptoluhlxuttly`**, which is *neither*
     staging nor production and is not a project anyone here recognises.
2. **The ad-hoc helpers listed above are not guarded.** They follow whichever
   environment is loaded rather than defaulting to production, which is why they
   were not in the original six — but anything added here should still call
   `guardDatabase()` as its first line.
