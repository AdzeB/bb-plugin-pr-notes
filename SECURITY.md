# Security

Report a suspected vulnerability through the repository's private GitHub vulnerability reporting option when available. If it is unavailable, open an issue asking for a private contact channel without posting credentials, private PR content, or exploit details.

PR Notes runs as a full-trust BB plugin. It reads GitHub through the GitHub CLI session on the BB server and uses that account for comments and PR actions. It stores no GitHub token of its own. Private notes are stored by BB; selected PR context and saved notes are sent to the agent provider you choose.

Treat PR bodies, comments, check output, diffs, and persisted metadata as untrusted content. GitHub writes must follow an explicit UI action. Merge requests include the displayed head SHA and respect GitHub's repository rules. A failed or unconfirmed write must keep the draft and must not be retried automatically.
