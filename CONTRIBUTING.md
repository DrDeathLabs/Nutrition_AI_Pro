# Contributing

Thanks for contributing to Nutrition AI Pro.

## Development Setup

1. Install dependencies with `npm install`.
2. Create `.env` from `.env.example` and replace placeholder values.
3. Start the stack with `docker compose up -d --build`, or run the frontend/backend separately for local development.

## Local Validation

Before opening a PR, run the local release gates:

```bash
npm run lint
npm test
npm run build
```

If your change affects the running UI or user workflow, also validate:

```bash
npm run test:e2e
```

## Contribution Expectations

- keep changes backward compatible with the current Docker/PostgreSQL deployment unless a migration is explicitly documented
- do not commit real secrets, `.env` files, or generated credentials
- update documentation whenever behavior, roles, configuration, or deployment steps change
- add or update tests for route contracts, RBAC, auth, and regressions when behavior changes

## Documentation Expectations

This repository treats documentation as a release artifact. If you change:

- install behavior
- GHCR or Compose entrypoints
- roles or permissions
- backup/export/import behavior
- prompt or provider workflows
- operator procedures

then update the affected docs in the same change.

## Security-Sensitive Changes

Changes affecting auth, RBAC, settings, import/export, Docker exposure, provider integration, prompts, or secret handling should include:

- route and RBAC test coverage
- a short threat-model note in the PR description
- documentation updates if operator behavior changes

Security bugs should follow [SECURITY.md](SECURITY.md), not public issue reporting.
