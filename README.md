# Nutrition AI Pro — Fitness Recipe CMS

A self-hosted CMS that uses a local [Ollama](https://ollama.ai) LLM to generate structured fitness recipes, stores them in PostgreSQL, and lets you review, edit, and publish them through a web interface.

---

## Prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) (or Docker Engine + Compose)
- [Ollama](https://ollama.ai) running locally with at least one model pulled (e.g. `ollama pull llama3`)
- Node.js 20+ (for local development only)

---

## Quick Start

**1. Clone and configure**

```bash
git clone <your-repo-url>
cd recipe_generator_app
cp .env.example .env
```

Open `.env` and fill in:
- `POSTGRES_PASSWORD` — any strong password you choose
- `ADMIN_PASSWORD` — the password you'll use to log in to the app
- `JWT_SECRET` — a random 64-character hex string (`openssl rand -hex 32`)
- `ALLOWED_ORIGINS` — the URL you'll access the app from (default: `http://localhost:8080`)

**2. Start**

```bash
docker compose up -d --build
```

The app will be available at **http://localhost:8080**.

**3. Log in**

Use the password you set for `ADMIN_PASSWORD`.

---

## Configuration

| Variable | Description |
|---|---|
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | Database name |
| `ADMIN_PASSWORD` | App login password (min 8 chars) |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins for CORS |
| `PORT` | Internal container port (default: 80) |

---

## Connecting to Ollama

In **Settings → AI Connection**, set the Ollama URL. Allowed values:

- `http://host.docker.internal:11434/api/generate` — Ollama on the same host as Docker (recommended)
- `http://localhost:11434/api/generate` — if running the app directly (not in Docker)
- `http://127.0.0.1:11434/api/generate`
- `http://172.17.0.1:11434/api/generate`

Allowed ports: **11434** and **11480**.

Use **Test AI Connection** to verify before generating.

---

## Development

```bash
npm install
npm run dev          # Vite dev server with proxy to backend
node server/index.js # Backend only
```

## Testing

```bash
npm test             # Unit + security tests (no DB required)
npm run test:watch   # Watch mode
npm run test:coverage
npm run test:e2e     # Playwright E2E (requires running app at localhost:8080)
```

Integration tests run automatically in CI against a real PostgreSQL service.

## Build

```bash
npm run build        # Produces dist/
```

---

## Security

- All API routes require a JWT Bearer token
- Passwords compared with `crypto.timingSafeEqual` (timing-safe)
- SSRF protection: Ollama URL is validated against a strict allowlist
- XSS protection: all API data escaped before DOM insertion
- Rate limiting: 200 req/15min general, 10/15min for job creation, 5/15min for login
- Security headers via `helmet` (CSP, X-Frame-Options, HSTS, etc.)
- Database port bound to `127.0.0.1` only (not internet-accessible)
- Container runs as non-root user

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

---

## Rotating the Database Password

The PostgreSQL data directory stores the password set at initialization. To rotate:

1. Export your data: **Settings → Export Database**
2. `docker compose down -v` (removes the data volume)
3. Update `POSTGRES_PASSWORD` in `.env`
4. `docker compose up -d --build`
5. Re-import your data if needed

---

## License

MIT
