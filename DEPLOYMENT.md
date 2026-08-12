# Deployment

CI/CD via GitHub Actions (`.github/workflows/deploy.yml`), deploying to a
single EC2 instance running the backend under pm2 and the frontend as static
files served by nginx (which also reverse-proxies `/api` to the backend).

## Architecture

```
GitHub push to main
  -> verify job: npm ci + tsc --noEmit (backend), npm ci + vite build (frontend)
  -> deploy job (only on main):
       - vite build frontend
       - ssh into EC2: mkdir -p $EC2_DEPLOY_PATH/{backend,frontend/dist}
         (rsync can create the final dir but not missing parents, so this
         runs unconditionally rather than assuming setup-ec2.sh already
         created them with a matching path)
       - rsync backend source -> EC2:$EC2_DEPLOY_PATH/backend
       - rsync frontend dist  -> EC2:$EC2_DEPLOY_PATH/frontend/dist
       - rsync ecosystem.config.js -> EC2:$EC2_DEPLOY_PATH/ecosystem.config.js
       - ssh into EC2, run deploy/remote-deploy.sh:
           npm ci --omit=dev (backend deps, on the EC2 box's own arch/OS)
           pm2 startOrReload ecosystem.config.js
           pm2 save

EC2 instance:
  nginx :80 -> static files from $EC2_DEPLOY_PATH/frontend/dist
            -> proxies /api/* to http://127.0.0.1:4000/api/*
            -> serves index.html for the SPA's two routes ONLY (/ and /stats);
               anything else that isn't a real file is a genuine 404 rendered
               from /404.html. (It used to fall back to index.html for every
               path, which returned 200 for URLs that don't exist — Google
               classifies those as soft 404s.) Applied by deploy/patch-nginx.sh,
               which is idempotent and rolls back if `nginx -t` fails.
  pm2 process "openpscalc-backend" -> tsx src/server.ts (PORT=4000)
```

Backend dependencies are installed **on the EC2 box itself** (not copied from
the GitHub Actions runner) so native modules match the instance's actual
OS/architecture.

## One-time EC2 setup

1. SSH into the instance, copy `deploy/setup-ec2.sh` over, run it:
   ```
   scp deploy/setup-ec2.sh ec2-user@<host>:~/
   ssh ec2-user@<host> 'bash setup-ec2.sh ~/openpscalc'
   ```
   This installs Node 20, pm2, nginx, and creates the deploy directory.
   Assumes a Debian/Ubuntu AMI (apt-get); adjust for Amazon Linux (dnf/yum).

2. Configure nginx using `deploy/nginx.conf.example` as a template (the
   script prints the exact steps at the end).

3. Open inbound port 80 (and 443 if you terminate TLS) in the instance's
   security group.

4. Set these **GitHub repo secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `EC2_HOST` | Instance public IP or DNS |
   | `EC2_USER` | SSH user (e.g. `ubuntu`, `ec2-user`) |
   | `EC2_SSH_KEY` | Private key (PEM) that can SSH in as that user |
   | `EC2_DEPLOY_PATH` | Deploy directory on the instance, e.g. `/home/ubuntu/openpscalc` |
   | `API_KEY` | Must exactly match `API_KEY` in `$EC2_DEPLOY_PATH/backend/.env` on the box (`setup-ec2.sh` generates and prints it) |

   `EC2_DEPLOY_PATH` isn't sensitive — fine as a repo *variable* instead of a
   secret if you prefer, just keep the name the same or update the workflow.

5. Push to `main`. The workflow builds, deploys, and restarts the backend
   automatically from then on.

## API key gate

`server.ts` rejects any `/api/*` request (except `/api/health`) that doesn't
carry a matching `X-API-Key` header, **only if `API_KEY` is set** in the
backend's environment — unset, it's a no-op (kept that way so local dev needs
no setup). The frontend sends this header on every request, reading the key
from `VITE_API_KEY`, which Vite inlines into the built JS bundle.

**This is not real authentication.** Vite inlines `VITE_API_KEY` as a literal
string in the shipped bundle — anyone who loads the page, opens devtools, or
just `curl`s the JS file can read it. What it actually does: stop the API
from being casually called by tools/scripts that never load the frontend at
all (scrapers, stray bots hitting `/api/calculate` directly). It does not
stop someone who's willing to extract the key from the bundle and replay it.
If you need real protection against abuse (rate limiting, scraping,
DDoS), that's a different, larger piece of work — ask for it explicitly.

`setup-ec2.sh` generates a random key into `backend/.env` on first run and
prints it so you can copy it into the `API_KEY` GitHub secret. The deploy
workflow's rsync step excludes `.env`, so redeploys never touch it.

## Day to day

- **Every push/PR**: the `verify` job runs typecheck + build for both
  projects. Catches breakage before it ever reaches EC2.
- **Push to `main` only**: `deploy` job runs after `verify` passes.
- **Manual run**: Actions tab → "CI/CD" → "Run workflow" (workflow_dispatch).
- **Logs on the box**: `pm2 logs openpscalc-backend`, `pm2 status`.
- **Rollback**: there's no automated rollback — `git revert` the bad commit
  (or push an older commit to `main`) and let the pipeline redeploy it.

## Troubleshooting (issues actually hit standing this up)

These are already fixed in the scripts/configs in this repo, but the *why*
is worth knowing if something similar resurfaces:

- **`npm: command not found` in the "Install backend deps & restart via
  pm2" step.** Node/npm was never installed on the box — `setup-ec2.sh`
  hadn't been run yet (or was run as a different user than `EC2_USER`).
  Run it; `which npm` over SSH should return something non-interactively
  before re-running the workflow.

- **`rsync: mkdir ".../frontend/dist" failed: No such file or directory`.**
  rsync creates the final directory in a path but not missing *parent*
  directories. Happens if `EC2_DEPLOY_PATH` doesn't match whatever path
  `setup-ec2.sh` actually created, or it was never run. Fixed permanently
  by adding an explicit `mkdir -p` over SSH before the rsync steps (see
  the architecture diagram above) — the pipeline no longer depends on
  that one-time setup step having used a matching path.

- **`pm2: Script not found: .../node_modules/.bin/tsx`, app stuck
  `errored`.** `remote-deploy.sh` runs `npm ci --omit=dev` on the box.
  `tsx` was originally listed under `devDependencies` in
  `backend/package.json` — but this project runs TypeScript directly via
  `tsx` in production (no compile step), so it's actually a *runtime*
  dependency. Moved it to `dependencies`. If you ever add another
  CLI tool the running app needs (not just CI/local-dev tooling), it
  needs to live in `dependencies`, not `devDependencies`, for the same
  reason.

- **nginx returns 500, error log shows
  `stat() ".../frontend/dist/index.html" failed (13: Permission denied)`
  even though the file's own permissions look fine.** Ubuntu's default
  home directory permissions (`drwxr-x---`) block `www-data` (nginx's
  user) from traversing into `/home/<user>/...` at all, regardless of
  permissions further down the tree. Fixed by `chmod o+x "$HOME"` in
  `setup-ec2.sh` — grants traversal to named paths only, not directory
  listing, so it doesn't expose anything else in the home directory.
  Only matters if `EC2_DEPLOY_PATH` is under a home directory (it is, by
  default).

- **Site unreachable from outside, but `curl http://localhost/` on the
  box itself works fine.** Security group, not nginx — port 80 (and 443
  if applicable) needs an inbound rule. Nothing in this repo can fix that
  for you; it's an AWS Console / IaC change outside the instance itself.

- **TS5107 `'moduleResolution=node10' is deprecated`, only in CI, not
  locally.** CI's `npm ci` installs whatever the `^` range in
  `package.json` resolves to *today*, which can be newer than what's in
  your local `node_modules`. A newer TypeScript treated the deprecation
  as a hard error instead of a warning. Fixed with
  `"ignoreDeprecations": "6.0"` in `tsconfig.json` rather than switching
  `moduleResolution` outright, to avoid any behavior change.

## Local dry-run of the remote script

`deploy/remote-deploy.sh` is plain bash and takes the deploy path as its only
argument, so you can test it manually over SSH without touching GitHub
Actions:

```
ssh ec2-user@<host> 'bash -s' -- /home/ubuntu/openpscalc < deploy/remote-deploy.sh
```
