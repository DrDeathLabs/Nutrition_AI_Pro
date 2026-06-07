# Security Policy

## Supported Versions

Only the latest version on the `main` branch receives security fixes.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately:

1. Go to the repository's **Security** tab on GitHub
2. Click **"Report a vulnerability"** to open a private advisory

Or email the maintainer directly if the Security tab is not available.

**Please include:**
- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any relevant logs or proof-of-concept (redacted as needed)

You will receive an acknowledgement within 72 hours and a status update within 7 days.

## Scope

This is a self-hosted, single-admin application. The primary attack surfaces are:

- The admin login endpoint (`/api/auth/login`)
- The Ollama URL setting (SSRF risk)
- All API endpoints (authentication bypass risk)
- The recipe editor (XSS risk via AI-generated content)

## Known Hardening

- JWT authentication on all API routes
- Timing-safe password comparison
- SSRF allowlist on Ollama URL configuration
- XSS prevention via HTML escaping of all API data
- Helmet security headers (CSP, X-Frame-Options, HSTS)
- Rate limiting on all endpoints
- DB port bound to `127.0.0.1` only
- Container runs as non-root user
