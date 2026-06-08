# Data Flow Diagram

```mermaid
flowchart TD
  login["User Login Request"] --> auth["Auth Router"]
  auth --> users["users table"]
  auth --> token["JWT session token"]

  generate["Generation Request"] --> queue["jobs table"]
  queue --> worker["Worker Loop"]
  worker --> settings["settings table"]
  worker --> provider["LLM provider"]
  provider --> draft["Draft candidate"]
  draft --> integrity["Integrity validation"]
  integrity --> critic["Critique / tastiness gate"]
  critic --> drafts["recipes table (draft)"]
  worker --> logs["terminal_logs table"]

  convert["Conversion Request"] --> convertQueue["jobs table (source recipe set)"]
  convertQueue --> worker

  editor["Editor/Admin Save"] --> api["Recipe CRUD API"]
  api --> recipes["recipes table"]

  backup["Export/Import"] --> exportApi["Admin export/import API"]
  exportApi --> recipes
  exportApi --> settings
  exportApi --> queue
```

## Notes

- Authentication flows through the `users` table after bootstrap.
- Sensitive provider API keys are decrypted only inside the server process when needed.
- Net-new generation is iterative: the app drafts, validates, critiques, and retries before a user sees a draft.
- Conversion jobs reuse an existing recipe and ask the AI to create a new wrapper format such as blog, social, or email content.
- Generation jobs, prompts, settings, logs, and content all persist in PostgreSQL.
- Export intentionally excludes plaintext secret material.
