# Verification

PR Notes is checked at three boundaries:

- Static checks: TypeScript, formatting, public-file checks, release-note validation, and the BB plugin build.
- Live BB behavior: the Playwright E2E suite opens the installed plugin in an isolated headless browser and exercises inbox reads, pagination, filters, cached views, drafts, diffs, description chips, activity, comments, PR controls, and Checks.
- Release and marketplace: the package is inspected for required assets and excluded private/debug data, then the public source and marketplace entry are validated.

The E2E suite reads public GitHub PR data. It simulates all comment writes, PR mutations, and agent creation; passing tests do not claim a real merge or comment was posted. Tests restore temporary private note content. Trace files and full runner reports stay outside Git.

Run `npm run check` and `npm run build` for static validation. Run `npm run test:e2e` against a development BB installation for behavior checks. The CI workflow does not run against a personal BB server and does not claim to execute that live E2E suite.

`docs/screenshots/` contains captures of the running plugin at device-pixel ratio 2 with public/sample PR data. Each image is at least 1,200 pixels wide and under 2 MiB. Screenshots exclude the host sidebar, personal projects, unrelated threads, local paths, and credentials.

See [the writing review](writing-review.md) for copy coverage and [VERIFICATION.md](../VERIFICATION.md) for the behavior acceptance cases.
