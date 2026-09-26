---
name: submit-improvement
description: Capture a concrete improvement discovered while using Namuk Process and route it to the plugin source repository. Use when the user asks to send feedback or when a reusable weakness in this plugin's workflow becomes clear.
---

# Submit a Namuk Process improvement

Use this workflow when the user asks to report an improvement, or when using Namuk Process reveals a repeatable gap in its workflow. Do not interrupt the current task for speculative ideas; mention them briefly and let the user decide whether to capture one.

1. Describe the observed friction with evidence from the current task. Separate the observation from the proposed change.
2. Keep the proposal focused on improving Namuk Process itself. Do not include unrelated project code, secrets, credentials, or private user data.
3. The plugin repository is `skadnr3126/namuk-process`. Look for its source checkout by locating `.codex-plugin/plugin.json` with `name: namuk-process`; use it only if it is a Git worktree whose remote points to that repository. Never edit an installed or cached copy of the plugin.
4. When the user explicitly asks to send the improvement and the source checkout is available, make the smallest relevant plugin change, validate its manifest and skill files, review the diff, then create a branch and draft pull request.
5. If there is no source checkout but a GitHub connection is available, inspect the current repository files, create a branch, apply the smallest relevant plugin change, validate the changed content, and create a draft pull request. Keep the report free of unrelated project code, secrets, credentials, and private user data.
6. If neither the source checkout nor a GitHub connection is available, return a ready-to-file proposal and say that it was not sent:

```markdown
## Observed friction
[What happened and where]

## Evidence
[Concrete example, without private project data]

## Proposed plugin change
[Small change to a Namuk Process instruction or workflow]

## Acceptance check
[How a user can tell the change helped]
```

Do not claim a proposal was sent unless it was added to the source repository or submitted to its configured remote.
