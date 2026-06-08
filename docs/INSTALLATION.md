# Installation

This guide covers the supported install and bootstrap paths for Nutrition AI Pro.

At the end of either path you should have:

- PostgreSQL running in Docker with a persistent named volume
- the web app available at `http://localhost:8080`
- a healthy `/healthz` response
- a working seeded admin login so you can configure an AI provider

## Install Path Matrix

| Path | Best for | Uses | Recommended when |
| --- | --- | --- | --- |
| `Published image install` | operators | `docker-compose.pull.yml` | a public GHCR package exists for the version you want |
| `Source build install` | developers, early adopters, fallback installs | `docker-compose.yml` | you want to build locally or the public image is not available yet |

Canonical image path:

`ghcr.io/drdeathlabs/recipe_generator_app`

Canonical entrypoints:

- image-based install: `docker-compose.pull.yml`
- source-build install: `docker-compose.yml`

## Common Requirements

- Docker Desktop or Docker Engine with Compose
- one AI provider:
  - local Ollama
  - Claude API access
  - OpenAI API access
  - Gemini API access
- Node.js 20+ only if you are developing outside Docker

Required local file:

- `.env`

Create `.env` from `.env.example` before starting either install path.

POSIX shell:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Replace the placeholder values before starting the stack. At minimum, set:

- `POSTGRES_PASSWORD`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `SETTINGS_ENCRYPTION_KEY`
- `ALLOWED_ORIGINS`
- `INITIAL_ADMIN_USERNAME`

If you are installing for real use, set long random values now rather than planning to rotate them later.

## Published Image Install

This is the intended primary install path for released builds.

### What this path does

- uses the published app image from GHCR
- starts PostgreSQL locally in Docker
- starts the app container against that database
- persists database data in the named Docker volume

### Default package path

The compose file defaults to:

`ghcr.io/drdeathlabs/recipe_generator_app:latest`

You do not need to set `IMAGE_NAME` or `IMAGE_TAG` if you are using the canonical package path and `latest`.

### Optional image override

Use this only for forks, private packages, or pinned versions.

PowerShell:

```powershell
$env:IMAGE_NAME="ghcr.io/your-org/your-package"
$env:IMAGE_TAG="v1.0.0"
```

POSIX shell:

```bash
export IMAGE_NAME=ghcr.io/your-org/your-package
export IMAGE_TAG=v1.0.0
```

### Pull and start

```bash
docker pull ghcr.io/drdeathlabs/recipe_generator_app:latest
docker compose -f docker-compose.pull.yml up -d
```

If you prefer to let Compose perform the pull:

```bash
docker compose -f docker-compose.pull.yml pull
docker compose -f docker-compose.pull.yml up -d
```

### If `docker pull` fails

If `docker pull ghcr.io/drdeathlabs/recipe_generator_app:latest` returns `denied` or `not found`:

1. confirm the release workflow completed successfully
2. confirm the GHCR package is public if anonymous pulls are expected
3. fall back to the source-build path until the package is available

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the detailed recovery path.

### Validate the install

```bash
curl http://localhost:8080/healthz
```

PowerShell alternative:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8080/healthz | Select-Object -ExpandProperty Content
```

Expected result:

```json
{"ok":true,"dbReady":true}
```

Then:

- open [http://localhost:8080](http://localhost:8080)
- sign in with `INITIAL_ADMIN_USERNAME` and `ADMIN_PASSWORD`
- configure an AI provider
- run the in-app AI health check

### Update later

```bash
docker pull ghcr.io/drdeathlabs/recipe_generator_app:latest
docker compose -f docker-compose.pull.yml up -d
```

Or:

```bash
docker compose -f docker-compose.pull.yml pull
docker compose -f docker-compose.pull.yml up -d
```

For the operator runbook, see [UPGRADES.md](UPGRADES.md).

## Source Build Install

Use this path when:

- the public image is not available yet
- you want to inspect or modify the source
- you are doing local engineering work

### Build and start

```bash
docker compose up -d --build
```

This builds the local app image, then starts:

- `recipe-postgres`
- `recipe-generator`

### Validate the install

```bash
curl http://localhost:8080/healthz
```

PowerShell alternative:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8080/healthz | Select-Object -ExpandProperty Content
```

Then:

- open [http://localhost:8080](http://localhost:8080)
- sign in
- configure a provider
- run the in-app AI health check

## Local Development

Install dependencies:

```bash
npm install
```

Frontend development:

```bash
npm run dev
```

By default the Vite dev server proxies `/api` to `http://localhost:8080`. Override `VITE_API_PROXY_TARGET` only when the API is running elsewhere.

Backend-only development:

```bash
node server/index.js
```

If the backend runs directly against the Dockerized database on the host:

- `POSTGRES_HOST=localhost`
- `POSTGRES_PORT=5433`

## Validation Checklist

- `/healthz` returns `{"ok":true,"dbReady":true}`
- sign-in works with `INITIAL_ADMIN_USERNAME` and `ADMIN_PASSWORD`
- the chosen AI provider passes the in-app AI health check
- drafts and library views load after authentication
- the Generator page shows queue activity when an editor or admin submits a job

## If Install Fails

Use [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for:

- GHCR pull failures
- unhealthy containers
- database auth or volume mismatch
- login problems
- provider configuration failures

## Related Docs

- [PRODUCTION.md](PRODUCTION.md)
- [UPGRADES.md](UPGRADES.md)
- [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
