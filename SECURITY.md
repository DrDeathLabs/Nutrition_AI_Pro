# Security Policy

This file explains the application security model, the supported release scope, and the operator controls that still matter after the built-in hardening is in place.

## Supported Versions

Only the latest code on the default branch and the most recent published container images are supported for security fixes.

## Reporting a Vulnerability

Do not open public issues for suspected security vulnerabilities.

Report privately through one of these channels:

1. GitHub Security Advisories, if enabled for the repository
2. Direct maintainer contact listed in the repository profile or release notes

Include:

- a clear description of the issue
- affected version or image tag
- reproduction steps
- expected impact
- relevant logs, screenshots, or proof-of-concept material with secrets redacted

Target response times:

- acknowledgement within 72 hours
- triage update within 7 days

## Security Model

Nutrition AI Pro is a self-hosted application. It can run on a private workstation, internal host, or internet-facing system, but operators remain responsible for:

- host OS security
- reverse proxy and TLS
- firewall and network policy
- secrets handling on the host
- backups and restore validation
- user lifecycle and access transfer

Primary application attack surfaces:

- `POST /api/auth/login`
- authenticated API routes under `/api/`
- provider configuration and AI health checks
- Ollama URL configuration
- prompt management
- backup export/import operations
- AI-generated content rendered in the browser

## Implemented Hardening

- JWT bearer authentication on protected routes
- role-based authorization for admin, editor, and viewer actions
- bootstrap-only env password fallback after user seeding
- bcrypt password hashing
- encrypted-at-rest external AI API keys using AES-256-GCM
- masked secret values in settings responses
- strict Ollama SSRF allowlist for host and port validation
- admin-only access to logs, settings, prompts, system info, exports, imports, and operational stats
- request rate limiting for login, general API use, and job creation
- CSP and other security headers via `helmet`
- non-root application container
- loopback-only default PostgreSQL host binding
- app and database health checks for runtime readiness and smoke validation

## Required Operator Controls

For public or production deployments, operators should:

- set strong unique values for `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`, `JWT_SECRET`, and `SETTINGS_ENCRYPTION_KEY`
- prefer a dedicated `SETTINGS_ENCRYPTION_KEY` instead of relying on the compatibility fallback to `JWT_SECRET`
- expose the app only through TLS termination and a reverse proxy
- restrict access to trusted networks or authenticated users where possible
- monitor application, database, and proxy logs
- validate restore procedures before relying on backups
- rotate admin credentials and provider API keys when access changes hands

## Known Residual Risks

- LLM output quality is improved by validation and critique passes, but malformed or low-value content can still occur.
- The app stores recipes, prompts, settings, logs, and users in one PostgreSQL database. Operators still own database encryption, backup hygiene, and host access controls.
- Terminal log volume can grow quickly in active generation environments. Retention cleanup helps, but operators should still monitor storage usage.
- This release does not include MFA, SSO, or an external secrets-manager integration.

## Scope Notes

Out of scope for this repository-level policy:

- vulnerabilities in operator-managed reverse proxies, TLS certificates, cloud accounts, or firewalls
- compromise caused by leaked environment files on the host
- provider-side outages or vulnerabilities in third-party LLM services

## Related Docs

- [docs/PRODUCTION.md](docs/PRODUCTION.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- [docs/RELEASE_SECURITY_REVIEW.md](docs/RELEASE_SECURITY_REVIEW.md)
