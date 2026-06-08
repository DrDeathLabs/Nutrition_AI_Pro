# User Guide

This guide is for people who use Nutrition AI Pro day to day: viewers, editors, and admins.

It explains how the product works, how the content lifecycle moves through the app, and how the AI engine supports content development. Installation, infrastructure, and host operations live in the operator docs:

- [INSTALLATION.md](INSTALLATION.md)
- [PRODUCTION.md](PRODUCTION.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [../SECURITY.md](../SECURITY.md)

## Overview

Nutrition AI Pro is a recipe and content production workspace. It helps teams:

- generate recipe-centered content
- review and refine drafts
- convert strong recipes into other publishing formats
- manage prompts and providers
- finalize approved assets into a reusable library

Supported content types:

- `recipe_card`
- `blog_post`
- `meal_prep_guide`
- `social_hit`
- `email_newsletter`

## Core Concepts

| Concept | What it means |
| --- | --- |
| `Job` | A queued or active AI task that creates or converts content |
| `Draft` | Content that passed the AI pipeline but still needs human review |
| `Final library` | Approved content that has been promoted out of drafts |
| `Content type` | The output format the app is generating or converting into |
| `Conversion` | Reusing an existing recipe to create a new wrapper format such as blog, social, or email |
| `Prompt` | A system instruction that shapes how the app asks the AI to generate or critique content |
| `Active AI provider` | The current provider the worker uses for generation and critique |

## Roles and Permissions

| Role | What it can do | What it cannot do |
| --- | --- | --- |
| `viewer` | sign in, browse drafts and final content, review account/session info | queue jobs, change admin settings, manage prompts, manage users |
| `editor` | queue jobs, review queue activity, edit content, finalize drafts, convert content, bulk-approve | access admin-only settings such as logs, prompts, provider configuration, imports, exports |
| `admin` | everything editors can do, plus provider setup, prompt management, user management, logs, stats, import/export | infrastructure tasks still stay outside the app |

Non-admin users keep access to the account area, but operational settings are hidden and protected server-side.

## Daily Work By Role

### `viewer`

Typical day:

- sign in
- monitor the Generator and queue state without starting jobs
- review Drafts and finalized Library content
- check personal session and account details

### `editor`

Typical day:

- queue new generation jobs
- review queue progress and terminal activity
- refine drafts in visual, structured, and JSON views
- finalize strong drafts
- convert proven recipes into blog, social, and email derivatives

### `admin`

Typical day:

- configure and test providers
- maintain prompts and generation defaults
- manage users and password resets
- review logs, security posture, and data/export tools
- perform import/export and release-safety checks

## Getting Started

### First login

Sign in with your username and password. The initial seeded admin username comes from `INITIAL_ADMIN_USERNAME`.

If login fails:

- verify you are using your username, not an email address
- verify the password is correct
- ask an admin whether the account is active

### Session basics

The app keeps the current session in browser session storage. If the session expires or the API returns `401`, the app clears the session and returns you to the login screen.

The account area shows:

- username
- role
- token issue time
- token expiry time
- remaining session duration

### Main navigation

The top navigation is built around three working areas:

- `Generator`
- `Library`
- `Settings`

`Logout` ends the browser session and returns you to sign-in.

## Workflow 1: Generate Net-New Content

The Generator view is the production cockpit for fresh AI work.

### What editors and admins can set

- content type
- fitness goal
- meal type
- free-form extra details
- batch amount

Use extra details for practical direction such as preferred ingredients, style constraints, nutrition goals, or exclusions.

### What happens when you submit

When you queue a job:

- the request is stored as a background job
- the worker picks it up from the queue
- the terminal starts showing progress and streamed AI activity
- the queue panel shows active and pending jobs
- the status badge changes between `IDLE` and `LIVE`

The queue is not only a progress display. It is the contract between the UI and the worker. Jobs remain visible there while they are pending, processing, completed, or failed.

The app is designed for editorial oversight. You are expected to watch the draft quality and review the resulting content before finalizing it.

### Job cancellation

The interface may show a `STOP ALL` control while the worker is active. The backend only accepts cancellation from editors and admins. Successful cancellation marks queued and active jobs as failed so the worker stops on its next status check.

### What viewers see

Viewers can open the Generator page, but the generation form is hidden. This lets them observe activity without starting jobs.

## How the AI Engine Works

Nutrition AI Pro uses an iterative AI workflow rather than a one-shot prompt flow. The app is designed to improve content before a human sees the result in Drafts.

There are two product-level paths:

- `Net-New Generation Path`
- `Recipe Conversion Path`

### Net-New Generation Path

This path is used when a user submits a fresh generation job from the Generator screen.

#### High-level flow

1. The user submits a content type, goal, meal type, amount, and optional extra direction.
2. The worker loads the active provider and current prompt/settings state.
3. The worker selects the correct prompt for the target content type.
4. The worker adds variety steering so outputs do not collapse into the same ingredients, dish formats, or narrative structures repeatedly.
5. The model produces a candidate content asset.
6. The app validates the structure.
7. The app critiques recipe quality and tastiness.
8. Rejected attempts are retried with feedback from the failed attempt.
9. Passing results are saved to the Drafts Inbox.

#### Drafting step

The `Drafting step` is where the active provider writes the candidate recipe or wrapper content.

The app helps the model avoid repetitive, low-value output by steering toward:

- different ingredient patterns
- different dish formats
- different narrative openings for blog, social, and email variants
- stronger cuisine direction and flavor identity

#### Critique/tastiness step

The `Critique/tastiness step` is what makes the app feel more agentic than a simple generator.

Before a draft is saved, the app runs:

1. `Integrity validation`
   - checks that the JSON structure matches the expected output shape
   - rejects malformed or incomplete content

2. `Tasting panel critique`
   - checks whether the recipe sounds genuinely appealing
   - looks for a real flavor hook, stronger seasoning logic, contrast, brightness, and overall desirability
   - rejects content that is merely edible, repetitive, or weakly conceived

This means the system drafts, critiques, and retries before the human review step begins.

### Recipe Conversion Path

This path is used when a user clicks `Convert` on an existing draft or finalized recipe.

#### What conversion does

Conversion keeps the underlying recipe and asks the model to create a new wrapper format around it. This is how a good recipe can become:

- a blog post
- a social asset
- an email newsletter draft

The result is saved as a new draft for human review.

#### What conversion does not do

Conversion does not replace the source recipe. It creates a derivative asset. The source and target content types cannot be the same, and `meal_prep_guide` is not currently supported as a conversion target.

## Workflow 2: Review the Drafts Inbox

The Drafts Inbox is the handoff point between the AI engine and the human editorial workflow.

### What the Drafts table shows

- title
- content type
- meal type
- nutrition summary where available
- selection state for bulk actions
- row actions

### What editors and admins can do in Drafts

- open the integrated workspace
- review the visual preview
- edit the structured fields
- inspect the raw JSON
- finalize a draft
- convert a draft into another content type
- bulk-finalize drafts

Deletion is more restricted than ordinary editing. Treat destructive cleanup as an admin-level workflow even if a button is visible in some contexts.

### The integrated workspace

Each draft can be opened in three views:

- `Visual Preview`
- `Structured Editor`
- `Raw JSON`

Use the structured editor for most changes. Use raw JSON only when a nested structure is easier to correct directly in the data model.

### Finalizing content

Finalizing moves a draft into the finalized Library.

Before finalizing, check:

- title quality
- nutrition plausibility
- recipe appeal and flavor logic
- content-type fit for the publishing channel

## Workflow 3: Use the Final Library

The Library contains finalized content assets.

### Common Library tasks

- search by title
- filter by meal type
- filter by goal
- filter by content type
- sort by date or nutrition values
- paginate through the result set
- reopen finalized content for review or editing
- convert strong recipes into new formats

Editors and admins can bulk-approve content. Bulk deletion is restricted to admins.

## Workflow 4: Convert Strong Recipes Into More Content

Conversion is one of the most valuable production features because it lets teams reuse a proven recipe across multiple channels.

### Recommended conversion workflow

1. Start from a strong draft or finalized recipe.
2. Click `Convert`.
3. Choose the target content type.
4. Queue the conversion job.
5. Wait for the derivative draft to appear in Drafts.
6. Review it with the same editorial care as fresh generation.

### Good use cases

- turn a finished recipe card into a blog article
- build a social-first asset from a proven recipe
- create an email version from an already-approved recipe

## Settings for Admins

Admins have access to the full Settings workspace. Non-admins keep account-level access only.

### AI Providers

The AI Providers tab controls:

- provider credentials
- provider-specific model values
- connectivity testing
- active-provider selection

Current provider options:

- Ollama
- Claude
- OpenAI
- Gemini

The active provider is what the worker uses for both generation and critique unless an admin changes it.

If multiple provider tabs are configured, only one provider is active at a time. Saving credentials does not by itself switch production traffic to that provider.

### Generation defaults

The Generation tab stores defaults such as:

- default goal
- default meal type
- default batch amount

These defaults prefill the Generator form for teams that produce similar content repeatedly.

### Security view

The Security tab is a user-facing operational view, not a replacement for host-level security tooling.

Admins can see:

- allowed browser origins
- recent authentication events
- rate-limit posture at a glance

### User management

Admins can:

- create users
- assign roles
- activate or deactivate accounts
- reset passwords
- delete users

Use named accounts instead of shared credentials whenever possible.

## Prompt Management

The `AI LLM Calls` tab is admin-only and should be treated like production configuration.

### What prompt management controls

The registry includes:

- the core recipe-card prompt
- content-type prompts for wrapper formats
- a shared user-suffix prompt
- the critic prompt
- a provider-role prompt for hosted JSON-returning models

### When to change prompts

Change prompts when you are trying to improve system-wide output quality in a repeatable way, such as:

- strengthening tone for one content type
- tightening schema rules
- improving critic standards
- correcting a recurring generation weakness

### When not to change prompts

Do not use prompt changes for one-off campaign needs that belong in the job brief. Prompt edits affect future production globally.

## Account and Password Management

All authenticated roles keep access to the account area.

Users can:

- inspect their current session information
- change their own password

For normal operations, treat the app as database-backed user management. The bootstrap env credentials are not meant to be the long-term shared workflow.

## Logs, Data, and Backup Tools

These tools are primarily for admins.

### Logs

The Logs tab helps answer questions like:

- did a login fail?
- did the worker start a job?
- did the AI provider stream output?
- did validation reject a draft?

Common log categories you will see:

- `auth_success` and `auth_fail` for sign-in and password activity
- `sys` for queue, user-management, and admin actions
- `val` for integrity and tastiness-gate messages
- `ai_stream` for streamed provider output
- `error` for failed jobs, provider failures, or rejected operations

### Data overview

The Data tab provides quick counts for:

- total recipes
- drafts
- finalized recipes
- log entries

### Export

Export creates an application-level JSON backup. Use it for:

- content portability
- rollback support
- archival snapshots

It is useful, but it is not a complete disaster-recovery strategy.

Exports intentionally avoid plaintext secrets. Treat them as portable content/config snapshots, not full environment backups.

### Import

Import accepts supported JSON backup data and reports how many records were imported or skipped.

Import is intentionally conservative. Invalid records, unsupported settings, and excluded secret values are skipped instead of forcing partial or unsafe writes.

### Clear Drafts

Clear Drafts is a destructive cleanup action and should be used intentionally, such as after a bad test batch or a failed prompt experiment.

## User-Level Troubleshooting

### Login fails

Check:

- username instead of email
- correct password
- active account state
- access to the correct browser origin

### No AI output appears

Check:

- provider configuration
- active provider selection
- in-app AI health check result
- terminal output for provider or validation errors

### Jobs stay queued or appear stuck

Check:

- queue panel for pending vs processing jobs
- `LIVE` vs `IDLE` worker status
- terminal logs for retries or validation failures
- whether someone issued `STOP ALL`

### A recipe never reaches Drafts

Common causes:

- malformed model output
- integrity validation failure
- critic rejection because the recipe was weak or repetitive
- provider instability

Sometimes this is the quality gate doing its job, not an app defect.

### Settings tabs are missing

That is usually role-based behavior, not a rendering failure.

For broader install and operator issues, use [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Best Practices For Content Teams

- start with clear generation briefs instead of vague prompting
- review flavor logic, not just calories and macros
- reuse strong recipes through conversion instead of regenerating everything
- treat prompt changes as system-wide production changes
- finalize only after a human checks both structure and desirability
- keep named accounts instead of shared credentials
- export regularly before major prompt or workflow changes

## Related Docs

- [INSTALLATION.md](INSTALLATION.md)
- [PRODUCTION.md](PRODUCTION.md)
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md)
