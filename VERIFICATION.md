# Verification plan

These failure cases were recorded before implementing the plugin.

- Missing GitHub CLI, expired login, network failure, timeout, or a failed search must show a useful error and preserve private notes.
- Assigned PRs and requested reviews must be fetched separately, combined without duplicates, and filtered without losing their identity.
- Empty results must look different from a failed request; a failed refresh must not claim cached results are current.
- Invalid repository names, PR numbers, oversized notes, or arbitrary URLs must be rejected at the RPC boundary.
- PR titles, bodies, paths, comments, and notes are untrusted data. Render them safely and pass executable arguments without a shell.
- A note must survive page reloads and plugin reloads. Two editors must not silently overwrite each other's changes.
- Switching PRs or completing requests out of order must not show or save one PR's note on another PR.
- Unsaved note text must remain available after navigation, failed saves, and refreshes.
- Chats must retain the selected provider, project, environment, permissions, attachments, and first question from BB's native composer.
- Existing PR chats must reopen; selecting a PR must not launch an agent or write to GitHub.
- Failed chat creation must preserve the composer's draft. PR context must include its exact head SHA and current saved notes.
- Large PR responses and command output must be bounded and identify truncation.
- Reload/unmount must release timers, subscriptions, and subprocesses.
- The plugin must work in narrow and wide panels with keyboard accessible controls and BB theme colors.

Run the browser suite against an installed local plugin. It uses read-only GitHub requests and temporary private notes, removes its own fixtures, and captures repeatable reports and screenshots. No test may post a comment, review, or merge a PR. Agent creation is intercepted in the browser when checking the submission boundary.

## Additional acceptance cases

- Filter open/draft/closed/merged, Today/7d/30d/all, and repositories; persist selections and clear them. Filter on the server before pagination, including the browser's local day boundary.
- Load small pages, keep overlapping assigned/review PRs deduplicated, ignore stale responses after filter changes, and fetch the next page only near the bottom or on Load more. Reject a cursor belonging to other filters.
- Differentiate a clear inbox from no filter matches and from a failed first/next-page request. Retrying a next-page failure must not discard already loaded PRs.
- Render description headings, inline code, syntax highlighted fences, and semantic colors safely in light and dark themes.
- Show per-file unified and split diffs, binary/omitted patches, and changing-head errors without attributing a patch to the wrong SHA.
- Before the first message and in existing chats, keep the native input at the bottom in wide and narrow panels.

## PR actions and compact layout

- Keep PR rows compact and ellipsized while hover and accessible labels expose the full title.
- The filter popup must float above the list, keep checkmarks for selections, support keyboard focus and Escape, and avoid shrinking the scrollable inbox.
- Show only merge methods enabled by the repository. Disable actions when the current GitHub user lacks access or the PR state forbids them.
- Confirm merge, draft/ready, and close/reopen actions against the displayed PR and head SHA. Cancel must issue no mutation.
- Reject stale head SHAs and unsupported actions before any GitHub write. Merge includes GitHub's atomic SHA guard and respects branch protections.
- All mutation E2E tests intercept the action endpoint; the real endpoint is exercised only with invalid input or a deliberately stale SHA.

## Cached views and spacing

- Reopening an inbox or PR within five minutes must reuse the loaded pages, detail, diff, access checks, notes, and chat list without another RPC for that data.
- Concurrent reads for the same cache key share one request. Explicit refresh bypasses both client and server caches; PR actions invalidate cached state. Agent context and mutation preflight always fetch fresh data.
- A cache failure preserves previously displayed content. A response from before invalidation must not repopulate the cache.
- Remove the duplicated full-width title/status header. Keep inbox metadata in its existing compact toolbar.
- Repository options stay collapsed until requested, support search and selecting a few repositories directly, and allow entering a repository not yet loaded.
- Open a PR through a small toolbar control; the URL field must stay hidden until invoked and must close after successful navigation.

## Overview activity, comments, chips, and checks

- Overview contains the PR description, chronological activity, and a GitHub comment form. Full changed-file and check lists belong to their own tabs.
- Inline code remains a chip; a matching changed-file name gets a file icon and opens that file's diff. Code fences keep native highlighting, and untrusted Markdown never executes HTML or scripts.
- Activity pages include comments, commits, reviews, and state events, with identities, timestamps, links, and bounded bodies. Cached reads must not repeat on tab switches.
- Empty/whitespace comments cannot submit. Failed submissions preserve the exact draft; successful submissions clear it and show the returned comment. Repeated requests with the same request ID must not duplicate a confirmed post.
- Comment E2E tests intercept the mutation. Real-server checks use invalid/empty comments only and never post to GitHub.
- Repository choices open to the side of the filter menu without extending it downward; remain searchable and keyboard accessible, and stay within narrow viewports.
- Checks are grouped by failed, cancelled, pending, passed, and skipped, with workflow/app names, durations, native details links, and expandable annotation details. Never conflate skipped and passed checks.
- Every check and annotation read is pinned to a commit/check ID and a repository. Cache keys include the head SHA. Large lists are paged, and source previews must not claim a match to a different revision.
