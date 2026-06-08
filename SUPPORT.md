# Support

This file explains what this repository supports, what it does not support, and what maintainers need from users when a problem is reported.

## Supported Requests

This repository supports:

- self-hosted source builds
- Docker Compose deployment from source
- Docker Compose deployment from published GHCR images
- reproducible application bugs
- documentation corrections
- security reports through the private process in [SECURITY.md](SECURITY.md)

## Best First Step

Before opening a support request, check:

- [docs/INSTALLATION.md](docs/INSTALLATION.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- [docs/PRODUCTION.md](docs/PRODUCTION.md)

Most install, provider, and upgrade issues should be diagnosable from those guides.

## What To Include In A Support Request

Include:

- application version or image tag
- whether you are running from source or GHCR images
- host OS and Docker version
- the exact command you ran
- the observed error or failure mode
- relevant environment details with secrets redacted
- reproduction steps
- logs or screenshots that materially narrow the issue

## Support Boundaries

This repository does not provide guaranteed SLA-based support.

Operators remain responsible for:

- reverse proxy configuration
- TLS certificates
- firewall rules
- host OS security
- database backups
- third-party provider accounts and billing

## Security Issues

Do not open public issues for vulnerabilities. Follow the private reporting process in [SECURITY.md](SECURITY.md).
