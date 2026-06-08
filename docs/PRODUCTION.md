# Production Runbook

This guide is for operators running Nutrition AI Pro as a real service, whether on a workstation, an internal host, or an internet-facing system behind a reverse proxy.

## Deployment Intent

The app is release-ready for self-hosting, but it is not a managed platform. Treat the Docker stack as one component inside a broader security and reliability boundary that you operate.

The application is designed for additive, in-place-safe upgrades against an existing PostgreSQL volume.

## Runtime Components

The standard stack contains:

- `recipe-generator`: the application container
- `recipe-postgres`: the PostgreSQL container

Default ports:

- app: `http://localhost:8080`
- database: `127.0.0.1:5433`

Default operational entrypoints:

- source build: `docker-compose.yml`
- published image: `docker-compose.pull.yml`

## Required Secrets

Set strong, unique values for:

- `POSTGRES_PASSWORD`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `SETTINGS_ENCRYPTION_KEY`

Use a dedicated `SETTINGS_ENCRYPTION_KEY` for real deployments. The app can fall back to `JWT_SECRET` for compatibility, but that fallback should not be the long-term operating state.

## Network Exposure

Recommended defaults:

- keep PostgreSQL bound to loopback only
- expose the app through a reverse proxy with TLS
- restrict inbound app access to trusted users or networks where possible
- never expose the database directly to the public internet

## Reverse Proxy and TLS

Terminate TLS outside the app container.

Before going internet-facing:

- ensure HTTPS is enforced at the proxy layer
- ensure forwarded headers are correct if your proxy adds them
- set `ALLOWED_ORIGINS` to the actual browser origin users will access
- verify login, library loading, and settings access through the real public URL

## AI Provider Setup

Nutrition AI Pro can run against:

- local Ollama
- Claude
- OpenAI
- Gemini

Operator guidance:

- store hosted-provider API keys through the app settings UI or encrypted DB paths only
- rotate keys whenever operator ownership changes
- verify provider access with the built-in AI health check before letting teams queue production jobs

Ollama URLs are intentionally restricted to a small allowlist to reduce SSRF risk.

## Production Backup Strategy

Do not rely on app export alone.

Use both:

- app-level JSON export for content portability
- a real PostgreSQL or Docker-volume backup for disaster recovery

Minimum operator practice:

- export the app regularly
- back up the PostgreSQL volume or database itself
- test restore procedures before relying on them

Use [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) as the working restore guide.

## Upgrade Runbook

Recommended high-level process:

1. export an app backup
2. snapshot or back up the PostgreSQL volume/database
3. pull or build the new image
4. restart the stack with the correct Compose entrypoint
5. confirm `/healthz`
6. verify login, recipe counts, and AI provider state

Use [UPGRADES.md](UPGRADES.md) for the full runbook, including source-build and GHCR-specific paths.

## Monitoring and Operations

Operators should monitor:

- container health
- app health endpoint
- PostgreSQL disk growth
- failed login events
- AI generation failures
- queue backlog and repeated validation failures

Terminal log growth still needs monitoring even with retention cleanup enabled.

Minimum runtime checks:

```bash
docker compose ps
curl http://localhost:8080/healthz
```

For the pull-based path:

```bash
docker compose -f docker-compose.pull.yml ps
curl http://localhost:8080/healthz
```

## Failure Recovery References

Use [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for:

- GHCR pull failures
- Docker health failures
- DB password/volume mismatch
- login failures
- provider misconfiguration
- stuck or failing generation jobs

## Release and Publish Notes

The intended primary release install path is GHCR:

`ghcr.io/drdeathlabs/nutrition_ai_pro`

Until the first public package has been verified with an anonymous pull, source-build remains the practical fallback path.

## Related Docs

- [INSTALLATION.md](INSTALLATION.md)
- [UPGRADES.md](UPGRADES.md)
- [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [../SECURITY.md](../SECURITY.md)
