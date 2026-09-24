# `scripts/`

Operations scripts, run **by hand**. Nothing in this folder is wired to an npm
script, so nothing here runs unless someone deliberately types the command.

Two families live here: one-off tools from the original migration onto this
platform (from the old database and from Google Sheets / Excel), and day-to-day
operations tools.

---

## The one rule: staging is free, any other database must be named

`lib/db-guard.js`. Every script that touches a database calls it before doing
anything at all:

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

**Why it exists.** Three of these scripts had the production address hardcoded,
and three more fell back to production silently when `SUPABASE_URL` was unset —
which was the normal path, because the env files here define
`NEXT_PUBLIC_SUPABASE_URL`, not `SUPABASE_URL`. `import_broadsheet.js` wrote
student scores, `migrate.js` created users and imported whole schools, and
`reset_all_passwords.js` reset every password on the platform. None of that could
be triggered by an outsider — the risk was an environment left pointing the wrong
way overnight, and the next morning's command landing on live data.

---

## Removed on 2026-09-24, and how to bring any of them back

Four things were deleted. They were **not** broken — three of them worked fine
against the wrong database, which is exactly the problem.

| Removed | What it did | Why it went |
| --- | --- | --- |
| `reset_all_passwords.js` | Set **every account on the whole platform** to the password `school123` | One known password for every school, teacher and student |
| `import_broadsheet.js` | Deleted a school's scores for a term, then imported a spreadsheet into it | Ran against production by default, and it deletes before it writes |
| `api/super-admin/bulk-reset-passwords/route.ts` | Set every teacher and student in one school to `school123` | Same weakness, reachable through the API |
| `api/super-admin/bulk-reset-students/route.ts` | Set every student in one school to `<SCHOOLNAME><SCHOOLNAME><SCHOOLNAME>123` | The password was derivable from the school's own name, so a student could work out another student's |

### To restore any of them

They are still in git — nothing is lost. The commit below is the last one that
contained all four:

```bash
git show 9a31091:scripts/import_broadsheet.js > scripts/import_broadsheet.js

# or find it yourself
git log --oneline -- scripts/import_broadsheet.js
```

Use the same shape with the other three paths:

```
scripts/reset_all_passwords.js
src/app/api/super-admin/bulk-reset-passwords/route.ts
src/app/api/super-admin/bulk-reset-students/route.ts
```

**What comes back is the guarded version** — the scripts were guarded earlier the
same day, so a restored script still refuses production until the target is named
out loud.

### If you do bring one back

- **`import_broadsheet.js`** — the likely one, for onboarding a school that sends
  marks in a spreadsheet. Point it at **staging** first, and read the "clearing
  existing scores" line before letting it near a term whose results matter.
- **The two bulk password routes** — if you want this capability again, the right
  shape already exists in the repo: `generateUniquePassword()` in
  `src/lib/password.ts` is used by every other reset route
  (`school-admin/reset-password`, `super-admin/reset-password`,
  `schools/[id]/reset-password`, `bulk-provision-admins`). It gives each person a
  different password. The removed versions gave everyone the same one.

---

## The other one-off migration tools still here

These came from the same migration and have probably already done their job. None
is wired to an npm script.

| Script | What it is | Likely status |
| --- | --- | --- |
| `migrate.js` | Moved the old system's data in: read a `backup.sql`, created user accounts, imported schools, sessions, terms, classes, subjects, staff, students and scores. Also writes the generated logins to a file. | Finished if the move is done. Default backup path is a Windows path |
| `run-migration.js` | Built a brand-new empty database: ran `001_initial_schema.sql` and `seed.sql` over a direct connection | Finished; it does **not** apply later migrations |
| `run-migration-api.js` | The same bootstrap, through the REST API instead | Finished |
| `query_db.ts` | Ad-hoc look-up: find a school by name and print it | **Cannot run.** This repo has no `tsx` and no `ts-node`, so it has no runner. Type-checked only |

Tell whoever is cleaning up before deleting these — `migrate.js` is the only one
whose work would be hard to redo by hand.
