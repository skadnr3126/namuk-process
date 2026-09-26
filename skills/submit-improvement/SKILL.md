---
name: submit-improvement
description: Capture a concrete improvement discovered while using Namuk Process and route it to the plugin source repository. Use when the user asks to send feedback or when a reusable weakness in this plugin's workflow becomes clear.
---

# Submit a Namuk Process improvement

Use this workflow when the user asks to report an improvement, or when using Namuk Process reveals a repeatable gap in its workflow. Do not interrupt the current task for speculative ideas; mention them briefly and let the user decide whether to capture one.

1. Describe the observed friction with evidence from the current task. Separate the observation from the proposed change.
2. Keep the proposal focused on improving Namuk Process itself. Do not include unrelated project code, secrets, credentials, or private user data.
3. Look for the Namuk Process source checkout by locating `.codex-plugin/plugin.json` with `name: namuk-process`. Use it only if it is a Git worktree and its remote points to the plugin repository. Never edit an installed or cached copy of the plugin.
4. If the source checkout is available, make the smallest relevant plugin change, validate its manifest and skill files, review the diff, and prepare a branch and pull request for the user to review. Do not push or create the remote pull request unless the user explicitly asks to send it.
5. If the source checkout is unavailable, return a ready-to-file proposal in this format so it can be submitted once the repository is configured:

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
