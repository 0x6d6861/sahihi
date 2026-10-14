---
name: run-sahihi
description: Start, run, drive and screenshot the Sahihi app (api, worker, web) in this container. Use when asked to run or start Sahihi, sign in as a test user, click through a screen, take a screenshot of a page in light or dark, or check a change in the real app rather than in tests.
---

Sahihi is three processes (Hono api :4000, BullMQ worker, Next web :3000) on Docker infra
(Postgres, Redis, MinIO, Mailpit). Start them with `start.sh`, then drive the web app with
`driver.mjs`: it makes a verified user and workspace, calls the API as them, uploads PDFs, takes
screenshots and runs Playwright flows. All paths are relative to the repo root.

## Run (agent path)

```bash
.claude/skills/run-sahihi/start.sh          # cold: ~45 s; already up: ~5 s. Idempotent.
bun .claude/skills/run-sahihi/driver.mjs session --plan enterprise    # free|starter|business|enterprise
bun .claude/skills/run-sahihi/driver.mjs upload fixtures/cropbox-offset.pdf "Lease.pdf"
bun .claude/skills/run-sahihi/driver.mjs shot /files --wait "Lease.pdf"
bun .claude/skills/run-sahihi/driver.mjs shot /settings/storage --theme dark --out storage-dark
bun .claude/skills/run-sahihi/driver.mjs api GET /storage
bun .claude/skills/run-sahihi/driver.mjs flow .claude/skills/run-sahihi/flows/connect-storage.mjs --theme dark
.claude/skills/run-sahihi/stop.sh
```

- **Look at the PNG** (`.run/shots/<name>.png`, full page) after every `shot`/`flow`. Each run
  also prints `problems:`: page errors, console errors and 4xx/5xx responses (the browser's own
  `/favicon.ico` 404 is filtered out; the app has no favicon). `problems: none` plus a sane
  screenshot = the page works.
- `session` writes `.run/session.json` (email, password, cookie, workspace slug and id). Every
  later command uses it; run `session` again for a fresh user/workspace (e.g. another plan).
- `api METHOD /path [json]` calls `/api/<path>` through the web origin with the session cookie and
  pretty-prints the response. Use it to set state up quickly (create envelopes, connections…).
- `shot` waits for network idle, or for `--wait "<visible text>"` (more reliable on pages that
  poll). `--out` names the file; default `<path>-<theme>`.
- `flow <file.mjs>` runs a module exporting `default async ({ page, goto, shot, api, session })`
  in a signed-in browser. `flows/connect-storage.mjs` is a worked example: Radix select, a dialog
  form, a toast, two screenshots. Copy it for new flows; keep the ones worth reusing in `flows/`.
- Logs: `.run/logs/{api,worker,web,infra,db,dockerd}.log`. Emails (invites, OTPs): Mailpit at
  http://localhost:8025 (`curl -s localhost:8025/api/v1/messages`).

## Run (human path)

`bun run dev` starts api, worker, web and the marketing site in one terminal (Ctrl-C stops them).
Headless it's only useful for its logs; the driver above is how you see anything.

## Tests (no servers needed beyond infra)

```bash
bun test                                    # unit
bun run test:integration                    # api + worker against sahihi_test, Redis DB 15, MinIO
bun test --preload ./apps/api/test/preload.ts --timeout 60000 ./apps/api/test/storage.itest.ts  # one file
```

They don't clash with the running dev servers (own database and Redis DB).

## Marketing site (`apps/website`)

Its gate is in `apps/website/AGENTS.md` (`build`, `start`, `shots`). `bun run shots` launches
Playwright's default Chromium, which isn't installed here (see Gotchas); run a patched copy
(from the repo root; ends back on a free port 3001):

```bash
cd apps/website && API_URL=http://localhost:4000 bun run build && (API_URL=http://localhost:4000 nohup bun run start >/dev/null 2>&1 &)
timeout 60 bash -c 'until curl -sf http://localhost:3001 >/dev/null; do sleep 1; done'
sed 's#chromium.launch()#chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })#' scripts/screenshots.mjs > scripts/.shots-local.mjs && bun scripts/.shots-local.mjs; rm scripts/.shots-local.mjs
fuser -k 3001/tcp
```

## Gotchas

- **Docker after a container restart:** `/var/run` survives but processes don't. `dockerd` trusts
  the stale `/var/run/docker/containerd/containerd.pid`, whose PID now belongs to something else,
  and dies with `failed to start containerd: timeout waiting for containerd to start`. `start.sh`
  removes the stale pid/sockets when that PID isn't a containerd.
- **Chromium version:** `@playwright/test` 1.63 wants `chromium_headless_shell-1243`; the image
  has build 1194 at `/opt/pw-browsers/chromium`. The driver passes `executablePath` (override with
  `CHROMIUM_PATH`). Don't `playwright install`. There is no `chromium-cli` here.
- **Email verification:** sign-in refuses unverified emails, and nothing clicks the Mailpit link,
  so `session` sets `emailVerified` with `docker exec sahihi-postgres-1 psql`.
- **Plans** are only changeable by the `billing:set-plan` script (no UI); `session --plan` runs it.
  Integration-test workspaces default to Enterprise, but a new dev sign-up is Free.
- **Stopping:** in this sandbox `lsof` sees no listeners and api/worker share the command line
  `bun --watch src/index.ts`, so `pkill`/`lsof` patterns miss them. `start.sh` launches each with
  `setsid` and records `.run/<name>.pid`; `stop.sh` kills those process groups, then `fuser -k` the
  ports.
- **`next dev` rewrites `apps/web/AGENTS.md`** (and the website's) on start; `stop.sh` restores
  them so they stay out of your diff.
- **First request to a page compiles it** (10–30 s). `shot` waits up to 60 s; a first `shot`
  right after `start.sh` is slow, not broken.
- **Own storage locally:** `start.sh` adds `STORAGE_ALLOW_PRIVATE_ENDPOINTS=true` to `.env`, so
  Settings → Storage can connect `http://localhost:9000`, bucket `sahihi-customer`, keys
  `sahihi` / `sahihi-secret` (the flow above). Without it the endpoint is refused as private.
- **Playwright selectors on Arc forms:** labels repeat ("Bucket" vs "Folder in the bucket",
  "Sync" vs "No sync destinations yet"); use `{ exact: true }`. Arc `Select` is Radix: click the
  `combobox`, then `page.getByRole("option")` (the list renders outside the dialog).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `start.sh` exits 124 after ~60 s | Docker didn't come up: read `.run/logs/dockerd.log`. The containerd timeout is the stale-pid case above (handled); anything else, `sudo dockerd` by hand to see it. |
| `launch: Executable doesn't exist at …chromium_headless_shell-1243…` | You ran Playwright without the driver's `executablePath`; use the driver, or pass `/opt/pw-browsers/chromium`. |
| `strict mode violation: … resolved to 2 elements` | Make the locator exact (`{ exact: true }`) or scope it to the dialog. |
| A second worker/api after re-running `start.sh` | Processes started outside `start.sh` aren't tracked: `stop.sh`, then `start.sh`. |
| `No session: run driver.mjs session first` | `.run/session.json` is missing (e.g. after `git clean`); run `session`. |
