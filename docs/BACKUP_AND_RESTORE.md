# Backup and Restore

This guide explains what the app export covers, what it does not cover, and how operators should think about real recovery.

## Two Backup Layers

Nutrition AI Pro should be backed up at two layers:

1. `App export`
   - useful for content portability and point-in-time app-level snapshots
2. `Database or volume backup`
   - required for real disaster recovery

Do not rely on app export alone.

## What The App Export Covers

The export path is useful for:

- recipes
- jobs
- non-secret settings that are designed for export

It is a good safeguard before upgrades, prompt changes, or content experiments.

The export endpoint intentionally excludes secret material. It also does not serve as a raw clone of every internal table value.

## What The App Export Does Not Replace

It does not replace:

- a PostgreSQL backup
- a Docker volume snapshot
- host-level secret management
- infrastructure recovery planning

## Recommended Backup Practice

Minimum operator routine:

1. export application data regularly from the app
2. back up the PostgreSQL database or Docker volume on a schedule
3. test restore procedures before relying on them

## Simple Database Backup Example

If you are using the standard Docker stack:

```bash
docker exec recipe-postgres pg_dump -U postgres -d recipe_db > recipe_db.sql
```

This is a practical example, not a complete enterprise backup strategy.

## Restore Strategy

Choose the restore path based on what failed:

- `app-level recovery`: import a JSON export
- `full service recovery`: restore the database or volume, then restart the stack

## App-Level Restore

Use this when:

- you need to re-import exported content
- the database still exists and is otherwise healthy

High-level flow:

1. sign in as admin
2. open the Data area
3. import the JSON export
4. review imported vs skipped counts
5. verify drafts, final content, and settings behavior

Expect some values to be skipped during import if they are invalid, unsupported, or intentionally excluded for security reasons.

## Full Database Restore

Use this when:

- the database volume was lost or corrupted
- the entire stack must be rebuilt from backup

High-level flow:

1. stop the stack
2. restore the PostgreSQL database or volume from backup
3. restart the stack with the correct Compose entrypoint
4. verify `/healthz`
5. verify login
6. verify recipe counts, draft counts, and provider configuration

If your original failure involved changed database credentials, make sure the restored database and the current `.env` file agree before restarting the app.

## Validation After Restore

After any restore:

- confirm `http://localhost:8080/healthz`
- confirm admin login
- confirm recipe and job counts look sane
- confirm the AI provider configuration is still usable
- run the in-app AI health check

## Related Docs

- [INSTALLATION.md](INSTALLATION.md)
- [PRODUCTION.md](PRODUCTION.md)
- [UPGRADES.md](UPGRADES.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
