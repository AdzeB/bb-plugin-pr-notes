# Contributing

Open an issue with the expected behavior, what happened, and the BB version. For a change, describe the user-visible result and how you checked it.

Use Node 24 and run `npm ci --ignore-scripts`, `npm run check`, and `npm run build`. Install the plugin in a development BB instance to verify behavior. The public Plugin SDK is the API boundary; do not import private `@bb/*` packages.

Use the headless E2E suite for UI behavior. Tests must use a separate browser profile and must never post a real GitHub comment, merge a PR, or start an agent. Intercept mutations and use public or sample data. Keep browser traces, local reports, credentials, private repositories, and unrelated BB threads out of commits and screenshots.

Keep runtime dependencies in `dependencies` and host-provided UI modules in `devDependencies`. Preserve BB's native composer, chat, permissions, and user-selected environments. Read settings and stored values at their boundaries, bound growing responses, and release timers, listeners, and subprocesses when the plugin is disposed.

Update the changelog for a release. Tags are immutable: publish a new version for a fix.
