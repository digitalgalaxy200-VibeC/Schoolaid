# Deployment — DigitalGalaxy / SchoolAid

## Canonical target (pinned)

| | |
| --- | --- |
| GitHub | `digitalgalaxy200-VibeC/Schoolaid` |
| Default branch | `main` |
| Vercel team | `gwins-projects-dbff5bee` |
| Vercel project | `schoolaid-b1fa` |
| Project ID | `prj_gDIbZJVnV3m31WAuXusRAvmeKroX` |
| Team ID | `team_xLEAOcAq3cjjJ2M2mod0ZIHm` |
| Production URL | https://schoolaid-b1fa.vercel.app |

`.vercel/project.json` is **tracked in git**. Any clone of this repository is
already linked to the `schoolaid-b1fa` project, so a deployment cannot drift to
another Vercel project or account by accident.

## How a deployment happens

| Trigger | Result |
| --- | --- |
| Push / merge to `main` | **Production** deployment to `schoolaid-b1fa` |
| Push to any other branch | **Preview** deployment with its own URL |
| `npx vercel --prod` | Manual production deployment of the current working tree |
| `npx vercel` | Manual preview deployment |

The Git integration is the normal path: commit to `main`, push, and Vercel
builds and promotes automatically. The local checkout is currently on `staging`;
`vercel --prod` from here would promote staging code, so prefer the Git flow.

## Required environment variables

Set these in **Vercel → Project `schoolaid-b1fa` → Settings → Environment Variables**.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://iojiahkehnijxxczrgft.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only, never exposed to the client |
| `JWT_SECRET` | **must exist before deploying**; at least 32 characters; must not equal the service-role key |
| `RESEND_API_KEY` | optional until email is enabled |
| `DEEPSEEK_API_KEY` / `GROQ_API_KEY` | only if AI features are enabled |

`NEXT_PUBLIC_*` values are embedded at build time — change them, then redeploy.
Missing `JWT_SECRET` makes every login return 500 (see
`docs/Phase2-8_Completion_Report.md`).

## Guardrails

- `.env*` files are gitignored and must never be committed.
- `.vercel/project.json` contains project identifiers, **not** secrets.
- Production database is `iojiahkehnijxxczrgft`. The old staging project
  (`noyegdgrfzopfrwjunot`) no longer resolves.
- Operations scripts call `scripts/lib/db-guard.js` and refuse production unless
  `--confirm-target=iojiahkehnijxxczrgft` is passed.

## Verify a deployment

```bash
curl -I https://schoolaid-b1fa.vercel.app
# 200, redirecting to /login
```

## Custom domain

The project currently uses the Vercel URL. To move it permanently onto a
DigitalGalaxy domain, add the domain in **Vercel → schoolaid-b1fa → Domains**
and point the DNS record at Vercel. No code change is needed.
