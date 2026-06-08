# Release Security Review

Date: 2026-06-07

## Summary

This review covered public GitHub release readiness, GHCR image publishing readiness, and in-place-safe upgrades of the existing Docker deployment.

The objective was to clear publish-blocking correctness and security issues, tighten runtime defaults, and verify that the release can be operated as a self-hosted product rather than only as a local development stack.

## Checks Executed

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e` against the Dockerized app on `http://localhost:8080`
- `npm audit --omit=dev`
- `gitleaks detect --source=/repo --config=/repo/.gitleaks.toml --no-banner`
- `trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 recipe-generator-app:latest`
- route and RBAC review of operational/admin endpoints
- Docker Compose review for health checks and dependency ordering
- in-place Docker upgrade rehearsal with the existing PostgreSQL volume preserved
- release workflow review for secret scanning, image scanning, SBOM generation, and GHCR publishing

## Findings Discovered and Fixed

1. Stale tests still targeted removed `/api/system-contract` endpoints.
   - Fixed by updating the suite to the current `/api/prompts` API.

2. Operational read endpoints were too broadly accessible.
   - Fixed by making settings, prompts, logs, admin stats, and system info admin-only.

3. Runtime auth still allowed the env admin password after DB users existed.
   - Fixed by restricting env credentials to bootstrap-only behavior.

4. External AI API keys were stored plaintext in the database.
   - Fixed by encrypting sensitive settings at rest with AES-256-GCM and migrating existing plaintext values in place.

5. Docker runtime lacked a release-grade health endpoint and smoke-friendly health checks.
   - Fixed with `/healthz`, container health checks, and CI smoke validation.

6. A Playwright default password in the repo was not suitable for public release.
   - Fixed by replacing it with a non-sensitive E2E default.

7. Production dependency audit reported vulnerable `express` and `qs` versions in the resolved tree.
   - Fixed by updating the lockfile through `npm audit fix --omit=dev`.

8. The logout control no longer worked in the browser client.
   - Fixed by excluding the dedicated logout button from the generic navigation click binding that was overwriting its handler.

9. The local Docker deployment did not provide a dedicated settings-encryption key.
   - Fixed by adding a separate `SETTINGS_ENCRYPTION_KEY` to the deployment environment so encrypted provider secrets no longer depend on `JWT_SECRET`.

10. The runtime container image inherited high-severity CVEs from the bundled global `npm` toolchain in the base Node image.
    - Fixed by removing unused runtime package-manager binaries and global `npm` files from the final production image, then rescanning successfully with Trivy.

## Residual Risks Accepted For Publish

- Operators remain responsible for TLS, reverse proxy configuration, backups, and host security.
- The app does not include MFA or SSO in this release.
- LLM providers may still return malformed or poor-quality content; the app reduces this risk with validation and critique stages but cannot eliminate it.
- Terminal log growth still needs operational monitoring even with retention cleanup enabled.

## Upgrade Validation Notes

This release is designed to upgrade the existing Docker/PostgreSQL deployment in place:

- no destructive schema resets are required
- settings-secret encryption migrates existing plaintext values during startup
- user, recipe, job, and log tables remain intact
- local upgrade rehearsal completed successfully against the existing Docker volume on 2026-06-07
- post-upgrade health check returned `{"ok":true,"dbReady":true}`
- post-upgrade data counts matched the pre-upgrade baseline after validation cleanup:
  - recipes: `2406` final / `20` draft
  - jobs: `167` completed / `18` failed
  - users: `3`

## Validation Notes

- Full local quality gate passed on 2026-06-07:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e`
  - `npm audit --omit=dev`
- Local cyber checks passed on 2026-06-07:
  - `gitleaks` reported no leaks
  - strict `trivy` image scan reported `0` HIGH/CRITICAL vulnerabilities for `recipe-generator-app:latest`
- The E2E suite exercises real job creation against the target app. During validation, all synthetic jobs and drafts created during the review were removed so the persistent dataset returned to its original state.

## Documentation Validation Notes

The documentation set was validated against the running app and current repository state during this release-hardening round.

- source-build install path was validated locally with `docker compose up -d --build`
- pull-based Compose path was validated structurally and locally against a canonically tagged image using `docker-compose.pull.yml`
- public anonymous GHCR pull remains to be verified after the first real public publish of `ghcr.io/drdeathlabs/recipe_generator_app:latest`
- user-guide workflows were cross-checked against current RBAC, the Generator UI, Drafts, Library, conversion rules, and admin-only settings visibility
- operator docs were checked against the current Compose files, `/healthz`, export/import behavior, and the live Docker layout on this system

## Release Artifacts

The release workflow produces:

- GHCR container images
- Docker image scan results
- CycloneDX SBOM
- SPDX SBOM
- secret-scan results through CI

Operators should record the final image tag, release commit, and SBOM artifact identifiers for each published release.
