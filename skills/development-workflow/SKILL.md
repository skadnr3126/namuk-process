---
name: development-workflow
description: Structure software development tasks from understanding the request through implementation and verification. Use when planning, debugging, or changing code in a project.
---

# Development workflow

1. Restate the requested outcome and constraints. Identify the smallest useful scope; ask only for information that blocks progress.
2. Read the repository instructions and inspect the files on the actual execution path before changing code. Reuse existing helpers and patterns.
3. For a reported error, check in this order: text mistakes, format mismatches, incoming data shape or encoding, file and path mismatches, then logic or algorithm errors.
4. Make the smallest change that fixes the root cause. Avoid speculative abstractions and unrelated cleanup.
5. Verify the changed behavior with the smallest relevant check. Report what changed, what was checked, and any remaining limitation.
