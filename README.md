# Nutrition AI Pro

Nutrition AI Pro is a self-hosted recipe-generation CMS for fitness-focused content teams.

It combines structured recipe generation, multi-format content production, editorial review, prompt management, and operational controls in one application. The app is designed for teams that want more than a one-shot prompt box.

## Why This App Is Different

Nutrition AI Pro does not stop at "the model returned something."

Its content engine is iterative:

- it drafts content with the active AI provider
- validates the returned structure
- critiques recipe quality and tastiness
- retries weak or malformed outputs before saving drafts

That means the app behaves more like a production workflow than a simple chat wrapper. The full user-facing explanation lives in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

## Choose an Install Path

The canonical published package path for this repository is:

`ghcr.io/drdeathlabs/nutrition_ai_pro`

| Path | Use it when | Status |
| --- | --- | --- |
| `Published GHCR image` | You want the normal release install path and a public package is available | Intended primary path |
| `Source build` | You want to build locally, develop locally, or the first public image is not available yet | Supported fallback |

If `docker pull ghcr.io/drdeathlabs/nutrition_ai_pro:latest` returns `denied` or `not found`, use the source-build path until the public package has been published and made visible.

## Feature Areas

### Content workflow

- Recipe generation for `recipe_card`, `blog_post`, `meal_prep_guide`, `social_hit`, and `email_newsletter`
- Draft inbox for review, refinement, and promotion
- Finalized library with filtering, sorting, pagination, and bulk actions
- Conversion workflow for turning a strong recipe into blog, social, or email derivatives

### AI workflow

- Local Ollama plus Claude, OpenAI, and Gemini provider support
- Prompt registry for content-type prompts, the critic prompt, and provider-role instructions
- Iterative generation loop with integrity validation and a tastiness/quality gate
- Variety steering to reduce repetitive ingredients, format collapse, and repeated narrative patterns

### Operations and security

- JWT authentication with RBAC for `admin`, `editor`, and `viewer`
- Docker Compose deployment with PostgreSQL persistence
- Backup export/import workflows
- CI, Docker smoke validation, GHCR publishing, SBOM generation, secret scanning, and image scanning

## Quick Start

What you should expect from a healthy first install:

- PostgreSQL starts first and stays on `127.0.0.1:5433`
- the app starts on `http://localhost:8080`
- `http://localhost:8080/healthz` returns `{"ok":true,"dbReady":true}`
- the seeded admin account can sign in so you can configure an AI provider

### 1. Prepare configuration

Create `.env` from `.env.example` and replace the placeholder values. At minimum, set:

- `POSTGRES_PASSWORD`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `SETTINGS_ENCRYPTION_KEY`
- `ALLOWED_ORIGINS`

### 2. Install from published image when available

Use this path after the release workflow has published the image:

```bash
docker pull ghcr.io/drdeathlabs/nutrition_ai_pro:latest
docker compose -f docker-compose.pull.yml up -d
```

### 3. Or build from source

If the image is not available yet, or if you are developing locally:

```bash
docker compose up -d --build
```

### 4. Validate and log in

Open [http://localhost:8080](http://localhost:8080) and sign in with:

- username from `INITIAL_ADMIN_USERNAME`
- password from `ADMIN_PASSWORD`

Then configure an AI provider and run the in-app AI health check before starting real generation jobs.

For the detailed install matrix, shell-specific examples, troubleshooting, and upgrade notes, use [docs/INSTALLATION.md](docs/INSTALLATION.md).

If the GHCR package is not available yet or an anonymous pull is denied, use the source-build path and treat the published-image path as the canonical release target once the first public package is live.

## Documentation by Audience

### Users

- [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

### Operators

- [docs/INSTALLATION.md](docs/INSTALLATION.md)
- [docs/PRODUCTION.md](docs/PRODUCTION.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md)
- [docs/UPGRADES.md](docs/UPGRADES.md)
- [SECURITY.md](SECURITY.md)

### Contributors and release maintainers

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SUPPORT.md](SUPPORT.md)
- [docs/RELEASE_SECURITY_REVIEW.md](docs/RELEASE_SECURITY_REVIEW.md)
- [docs/boundary-diagram.md](docs/boundary-diagram.md)
- [docs/data-flow-diagram.md](docs/data-flow-diagram.md)

## Security Posture

This project is intended for self-hosted use. The application includes substantial hardening, but operators still own host security, TLS, reverse proxying, backups, monitoring, and provider-account security.

Implemented application controls include:

- JWT-protected API routes
- least-privilege RBAC on operational endpoints
- bcrypt password hashing
- bootstrap-only env credential fallback after user seeding
- encrypted-at-rest external AI API keys
- SSRF allowlisting for Ollama URLs
- CSP and other headers via `helmet`
- request rate limiting
- non-root application container
- app and database health checks

See [SECURITY.md](SECURITY.md) and [docs/PRODUCTION.md](docs/PRODUCTION.md) for the operator-facing details and residual risks.

## Development

Install dependencies:

```bash
npm install
```

Frontend development server:

```bash
npm run dev
```

Override the proxy target when needed:

```bash
VITE_API_PROXY_TARGET=http://localhost:80 npm run dev
```

Backend-only development:

```bash
node server/index.js
```

If the backend talks directly to the Dockerized Postgres on the host, use `POSTGRES_HOST=localhost` and `POSTGRES_PORT=5433`.

## Testing

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e` expects a running app at `http://localhost:8080`.

## Support

See [SUPPORT.md](SUPPORT.md) for support boundaries and what to include in a support request. Security issues should follow [SECURITY.md](SECURITY.md), not public issue reporting.

## License

MIT. See [LICENSE](LICENSE).
