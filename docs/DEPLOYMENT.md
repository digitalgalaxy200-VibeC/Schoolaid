# Deployment — DigitalGalaxy / SchoolAid

## Canonical target

| | |
| --- | --- |
| GitHub | `digitalgalaxy200-VibeC/Schoolaid` |
| Production branch | `main` |
| Vercel project | whatever `.vercel/project.json` points at (see below) |

`.vercel/project.json` is **tracked in git** and is the single source of truth
for which Vercel project this repository deploys to. Any clone is already linked
to that project, so a deployment cannot drift to another account by accident.

No deployment host is hardcoded in the application. `*.vercel.app` is treated as
a platform host by `src/lib/site/hosts.ts`, and every absolute URL the app hands
to a user is derived from the request (see `super-admin/schools/new`), so moving
to a different Vercel project needs no source change — only new credentials and
a fresh `vercel link`.

Historical note: the original project was `schoolaid-b1fa`
(`prj_gDIbZJVnV3m31WAuXusRAvmeKroX`, team `team_xLEAOcAq3cjjJ2M2mod0ZIHm`). That
project was paused by Vercel and is no longer the deployment target.

## How a deployment happens

| Trigger | Result |
| --- | --- |
| Push / merge to `main` | **Production** deployment of the linked project |
| Push to any other branch | **Preview** deployment with its own URL |
| `npx vercel --prod` | Manual production deployment of the current working tree |
| `npx vercel` | Manual preview deployment |

The Git integration is the normal path: commit to `main`, push, and Vercel
builds and promotes automatically. The local checkout is currently on `staging`;
`vercel --prod` from here would promote staging code, so prefer the Git flow.

## Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. Values are
never recorded in this repository.

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | all | `https://<project-ref>.supabase.co` (Supabase → Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | anon / publishable key; embedded in the client bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | all | server-only; mark **Sensitive** in Vercel |
| `JWT_SECRET` | all | **must exist before deploying**; at least 32 characters; must not equal the service-role key |
| `SUPABASE_JWT_SECRET` | all | **required** — the project's legacy HS256 JWT secret (Supabase → Project Settings → API → JWT Settings → Legacy JWT secret). The CBT question bank mints its own tenant-scoped tokens with it so Postgres enforces RLS; without it every CBT call returns 503 *"CBT database access is not configured"*. |
| `RESEND_API_KEY` | all | optional until email is enabled |
| `DEEPSEEK_API_KEY` / `GROQ_API_KEY` | all | only if AI features are enabled |
| `VERCEL_API_TOKEN` | prod + preview | **server-only**; powers school custom-domain automation in `src/lib/vercel/domains.ts`. Mark **Sensitive**. |
| `VERCEL_PROJECT_ID` | prod | the *current* project id; required by domain automation |
| `VERCEL_TEAM_ID` | prod | set when the project lives under a team |
| `VERCEL_BRANCH` | non-production only | attaches domains to that branch instead of production |
| `ALLOWED_ORIGINS` | optional | comma-separated extra hosts accepted by the CSRF origin check |

`NEXT_PUBLIC_*` values are embedded at build time — change them, then redeploy.
Missing `JWT_SECRET` makes every login return 500 (see
`docs/Phase2-8_Completion_Report.md`).

Every other variable is read at runtime on the server, so a change still only
takes effect after a **redeploy**. `/super-admin/health` lists which of these are
set on the deployment you are looking at — presence only, never values.

## Guardrails

- `.env*` files are gitignored and must never be committed.
- `.vercel/project.json` contains project identifiers, **not** secrets.
- Production database is `iojiahkehnijxxczrgft`. The old staging project
  (`noyegdgrfzopfrwjunot`) no longer resolves.
- Operations scripts call `scripts/lib/db-guard.js` and refuse production unless
  `--confirm-target=iojiahkehnijxxczrgft` is passed.

## Verify a deployment

```bash
curl -I "$DEPLOYMENT_URL"
# 200, redirecting to /login
# /super-admin/health lists which required variables are present (presence only)
```

## Custom domain

The project uses its Vercel URL until a domain is added. To move it permanently
onto a DigitalGalaxy domain, add the domain in **Vercel → Project → Domains**
and point the DNS record at Vercel. No code change is needed.

## Moving to a new Vercel project

Vercel does not allow a project to be transferred while its account is paused.
Recreating is the fallback, and it is safe: the database, storage and all school
data live in Supabase and are untouched.

1. Create the project in the new account and connect the same GitHub repo.
   Set **Production Branch = `main`**.
2. Re-enter the variables above. Production's secrets are typed **Sensitive**,
   so `vercel env pull` returns `[SENSITIVE]` for them — copy the real values
   from the provider dashboards, never from the old project.
3. Point `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` at the **new** project. Copying
   the old ids makes domain automation try to register school domains against a
   dead project.
4. Run `vercel link` locally and commit the updated `.vercel/project.json`.
5. Deploy `main`, then re-attach any school custom domains from the Super Admin
   domain panel (DNS verification runs again).
6. Keep the old project until the new one is verified; delete only after the
   custom domains have moved.

Deployment history, analytics, preview URLs and domain attachments do **not**
transfer. `JWT_SECRET` may safely be regenerated on the new project — cookies
are host-scoped, so every session has to be established again on the new domain
regardless.
