# Writing review

Scope: plugin-authored UI labels, placeholders, empty states, confirmations, static server errors, and public listing copy. The plugin has no locale files or translation framework; its interface is English. Counts use complete English message variants with `Intl.PluralRules`, and dates, numbers, lists, and relative time use `Intl`.

Vocabulary: pull request (PR in compact labels), Inbox, Overview, Code, Checks, Notes, Chat, draft, and conversation. Controls use sentence case. BB's host-owned composer and thread labels stay native.

| Principle | Severity | Locations | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| Errors explain recovery | HIGH, fixed | `github.ts:227`, `server.ts:249`, `pr-activity.tsx:173` | Every request error pointed to authentication; some rejected actions offered no next step. | Errors name connection/access checks, explain the PR state requirement, or direct the reader to refresh activity before retrying. | Readers can recover without changing an unrelated setting or duplicating a comment. |
| Status copy matches the state | HIGH, fixed | `pr-checks.tsx:64` | A queued check could show Running. | Queued, Pending, and Running follow the reported check state. | Readers do not mistake a waiting job for an executing job. |
| Confirm consequences | HIGH, fixed | `pr-controls.tsx:72` | Generic action title and a merge body naming only the commit and branch. | The title identifies the PR; the body states that merging changes the shared branch and cannot be undone from the dialog. | The person confirms the actual action and consequence. |
| Whole messages and locale formatting | MEDIUM, fixed | `copy.ts:22`, `pr-activity.tsx:189`, `pr-checks.tsx:299`, `pr-workspace.tsx:150`, `pr-ui.tsx:46`, `notes-editor.tsx:217`, `app.tsx:147` | Counts assembled around singular/plural fragments and hand-built relative dates. | Complete count messages with plural rules, and explicit `Intl` formatters. | Counts and dates stay readable and consistent. |
| Action labels and next steps | MEDIUM, fixed | `inbox-filters.tsx:98`, `pr-controls.tsx:15`, `app.tsx:238` | Noun-only filter labels and an idiomatic empty state. | Accessible actions say Filter pull requests, Choose repositories, and Mark ready for review; empty states explain the inbox scope and how to open a PR. | Actions and empty states tell the reader what is available. |
| Placeholders show examples | LOW, fixed | `open-pr.tsx:62`, `inbox-filters.tsx:264`, `app.tsx:160`, `notes-editor.tsx:201`, `pr-activity.tsx:354` | Placeholders repeated instructions or asked questions. | Fields show a URL, repository, search, note, or comment example; labels retain the action and object. | An example demonstrates the accepted format. |

GitHub-supplied PR titles, descriptions, comments, check output, and runtime CLI error detail: **Not verified** as authored copy. These remain external content rather than text rewritten by the plugin. The surrounding labels and recovery instructions were reviewed.

Verification: static string inventory, type check, formatter, and the headless E2E suite. The publication screenshots use the reviewed build. No HIGH findings remain in the inspected plugin-authored copy.

**Approve**
