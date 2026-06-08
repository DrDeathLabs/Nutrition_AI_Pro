# Upgrades

This guide covers the supported upgrade paths for Nutrition AI Pro.

## Upgrade Model

The app is designed for additive, in-place-safe upgrades against the existing PostgreSQL deployment.

That means:

- destructive schema resets are not expected
- existing user, recipe, job, and log tables should remain intact
- settings-secret migration happens in place when needed

## Before Any Upgrade

Do all of these first:

1. export an app backup
2. back up the PostgreSQL database or volume
3. record current recipe counts and basic health state
4. confirm which Compose entrypoint you are using

Useful baseline commands:

```bash
docker compose ps
curl http://localhost:8080/healthz
```

## Source-Build Upgrade Path

Use this path when you run the app from local source.

```bash
docker compose up -d --build
```

This rebuilds the app image locally and restarts the stack against the existing DB volume.

## GHCR / Pull-Based Upgrade Path

Use this path when you run the app from the published GHCR image.

```bash
docker pull ghcr.io/drdeathlabs/nutrition_ai_pro:latest
docker compose -f docker-compose.pull.yml up -d
```

Or:

```bash
docker compose -f docker-compose.pull.yml pull
docker compose -f docker-compose.pull.yml up -d
```

If the public package is not available yet, use the source-build path until the first publish is confirmed.

## Post-Upgrade Validation

After upgrading:

1. confirm `http://localhost:8080/healthz`
2. confirm admin login
3. confirm recipe counts and draft counts are still sane
4. confirm AI provider configuration still exists
5. run the in-app AI health check
6. confirm a test generation job can be queued by an editor or admin

## Rollback Expectations

Rollback is easier if you captured both:

- an app export
- a real database or volume backup

Rollback limits:

- app-level export is not the same as full infrastructure rollback
- if the database state changed after upgrade, your rollback quality depends on the DB backup you took before the change

## When To Stop And Investigate

Stop and investigate before proceeding further if:

- `/healthz` fails after restart
- login fails unexpectedly
- recipe counts drop unexpectedly
- provider configuration disappears
- the DB reports auth problems or schema errors

Use [TROUBLESHOOTING.md](TROUBLESHOOTING.md) and [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) if recovery is needed.
