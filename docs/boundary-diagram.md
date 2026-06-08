# Boundary Diagram

```mermaid
flowchart LR
  user["Authenticated User Browser"] --> app["Nutrition AI Pro Web App"]
  app --> api["Express API / Worker"]
  api --> db["PostgreSQL"]
  api --> ollama["Ollama (local host)"]
  api --> providers["Claude / OpenAI / Gemini APIs"]
  admin["Admin Operator"] --> docker["Docker Compose Host"]
  docker --> api
  docker --> db
```

## Notes

- The browser talks only to the app origin.
- The Express app is the enforcement point for authentication, RBAC, validation, and provider integration.
- PostgreSQL is intended to remain loopback-only on the host by default.
- Ollama access is limited to an allowlisted set of hosts and ports.
- Hosted AI providers are outbound dependencies, not inbound components.
