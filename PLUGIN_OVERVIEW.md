Keep a pull request's description, review work, private notes, and agent conversation together.

## What you get

- An inbox of assigned pull requests and review requests across GitHub repositories, with search, status and date filters, a side-opening repository picker, and pages that load as you scroll.
- A readable Overview with code chips, file links, activity, and GitHub comments. Code and Checks have separate tabs for diffs, workflow jobs, durations, and failure annotations.
- Private Markdown notes with draft recovery and conflict checks. Saved notes become context when you start a PR conversation.
- BB's native chat and composer, including your chosen provider, model, workspace, attachments, and permissions.
- Merge, squash/rebase, draft/ready, and close/reopen controls that follow your GitHub access and ask for confirmation.

## How it works

Open PR Inbox in BB. Select a pull request or use + to open a GitHub PR URL. Loaded views stay cached for five minutes; Refresh requests current data. Comments post to GitHub, while Notes stay private to your BB installation.

Agents in a linked PR conversation can read current context with `pr_notes_context`. The read-only commands are `bb pr-notes inbox`, `bb pr-notes context OWNER/REPO NUMBER`, and `bb pr-notes note OWNER/REPO NUMBER`.

## Requirements

Requires BB 0.48 or newer with Plugin SDK 0.6.94, and the separate GitHub CLI installation signed in on the BB server. Supports GitHub.com. Chat uses an agent provider you have configured and may incur that provider's charges. PR context and saved notes are shared with the provider when used in chat.
