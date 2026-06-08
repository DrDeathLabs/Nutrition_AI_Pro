# Troubleshooting

This guide covers the most common operational and install-time failures for Nutrition AI Pro.

## Install Fails Before Containers Start

Check:

- Docker Desktop or Docker Engine is running
- Compose is available
- `.env` exists and placeholder values were replaced
- required ports are not already blocked by another process

If you are using the published-image path, verify whether the package actually exists yet.

## GHCR Pull Returns `denied` or `not found`

Symptom:

- `docker pull ghcr.io/drdeathlabs/recipe_generator_app:latest` fails

Likely causes:

- the first public image has not been published yet
- the release workflow failed
- the GHCR package is still private

Recovery:

1. verify the GitHub release workflow completed
2. verify the package exists at `ghcr.io/drdeathlabs/recipe_generator_app`
3. verify the package is public if anonymous pull is expected
4. fall back to `docker compose up -d --build` until the image is available

## App Container Is Unhealthy

Symptom:

- `recipe-generator` shows unhealthy or keeps restarting

Check:

- `http://localhost:8080/healthz`
- container logs
- whether PostgreSQL is healthy first
- whether `.env` contains valid secrets and DB values

Common causes:

- database not ready
- wrong DB credentials
- bad environment values

Useful checks:

```bash
docker compose ps
docker compose logs recipe-generator --tail=100
docker compose logs db --tail=100
```

## Database Auth or Volume Mismatch

Symptom:

- the DB container starts but the app cannot connect
- Postgres errors mention authentication failure
- a password change seems ignored

Likely cause:

- the PostgreSQL volume was initialized with older credentials

Recovery:

1. do not destroy the volume until you know whether data must be preserved
2. verify the live DB credentials that match the initialized volume
3. if you must rotate credentials, back up first and follow [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md)

## Login Fails

Check:

- username instead of email
- correct password
- account is active
- browser is hitting the expected origin

For multi-user failures, inspect auth-related logs and system settings as an admin.

## AI Provider Health Check Fails

Check:

- the intended provider is selected
- provider credentials were saved
- the model value is valid
- Ollama is reachable if using local inference

If using Ollama:

- confirm the URL matches the allowed pattern
- confirm the model is actually available in the Ollama instance
- confirm the app container can reach `host.docker.internal` if Ollama is running on the host

## Jobs Stay Queued or Fail Repeatedly

Check:

- queue panel for pending vs processing jobs
- worker status (`LIVE` vs `IDLE`)
- app logs for repeated validation failures
- provider health and model stability

Remember that repeated rejection does not always mean the app is broken. The integrity gate and critic gate may be rejecting weak output.

If the worker is active but drafts never appear, read the log stream for `val` and `error` entries before assuming the provider is down.

## Prompt Changes Cause Poor Output

If output quality suddenly degrades after prompt edits:

1. review recent prompt changes in the admin prompt registry
2. compare behavior against a small controlled test run
3. reset the changed prompt to its built-in default if needed

Treat prompt changes like production configuration changes, not ad hoc content edits.

## Import or Export Behavior Is Confusing

Remember:

- export is an app-level JSON backup
- import reports imported and skipped records
- restore of the whole system still depends on database or volume backup strategy

Use [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) for the full recovery model.

## Need More Context

- install issues: [INSTALLATION.md](INSTALLATION.md)
- production operations: [PRODUCTION.md](PRODUCTION.md)
- upgrades: [UPGRADES.md](UPGRADES.md)
- backups and restore: [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md)
