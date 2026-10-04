---
name: improve-codebase-architecture
description: Inspect a codebase, choose worthwhile architecture improvements within the user's delegated scope, then design, implement, and verify them.
disable-model-invocation: true
---

# Improve codebase architecture

Improve the user's codebase within the scope they delegated. This skill owns investigation, design, code changes, and verification. The aim is testability and AI-navigability through deeper modules, greater locality, and simpler interfaces.

Use [codebase-design](../codebase-design/SKILL.md) for the architecture vocabulary and design principles. Use the project's existing domain terms and design decisions when naming modules and choosing seams.

## Process

### 1. Establish the goal, scope, and actual context

Reuse the user's objective, constraints, and delegation already established in the conversation. A review or advice request ends with findings; it does not authorize source edits. An implementation request authorizes routine design and code choices within its scope.

Define observable completion criteria from that objective before implementation. Reuse criteria already established in the conversation and investigate facts directly; ask only about missing user intent that would change the result.

Inspect the relevant source, data structures, state ownership, affected callers, dependencies, and tests. Read existing domain documentation and ADRs in the area. If the user named a module or pain point, start there. Otherwise, use recent Git history and observable architectural friction to focus the investigation. Scale the investigation to the likely change.

Determine whether these facts support an improvement within the delegated scope. If a material gap remains, use the relevant [clarity](../verify-request-clarity/SKILL.md), [context](../verify-request-context/SKILL.md), or [alignment](../verify-request-alignment/SKILL.md) check. Reuse information already known; these checks are not a mandatory sequence.

Ask only about unresolved choices that belong to the user and would change the desired outcome or behaviour. Investigate facts and resolve routine implementation choices directly. Pause only work that depends on a missing user decision. Once the goal, scope, and facts support implementation, continue without another approval step.

### 2. Choose a worthwhile improvement

Choose a bounded target supported by the code and the user's goal. Look for a concept scattered across modules, callers carrying implementation details, shallow pass-through modules, or behaviour that is difficult to verify through the current interface. Use codebase-design's deletion test and evaluate depth, locality, and leverage.

Explain briefly which files and callers are involved, what concrete friction the change removes, and why it is worth doing. Select the target within the delegated scope and continue. If the investigation finds no justified improvement, report that finding instead of making speculative changes. If a proposed change conflicts with an ADR, establish why revisiting that decision is necessary before implementing it.

### 3. Design and implement

Describe a short design using [codebase-design](../codebase-design/SKILL.md) and [DEEPENING.md](../codebase-design/DEEPENING.md). Include the module's responsibility and interface, seam placement, dependency handling, affected callers, and behaviour to preserve. If the user requests alternative interfaces, use [DESIGN-IT-TWICE.md](../codebase-design/DESIGN-IT-TWICE.md), then continue here with the chosen design.

Implement the improvement in the user's project. Migrate affected callers with the interface change and remove replaced modules once their callers are migrated. Preserve existing behaviour unless the user requested a behaviour change. Preserve unrelated user edits and follow the project's conventions.

Before replacing or deleting tests, identify the behaviour they cover and retain equivalent coverage through the new interface. Preserve distinct scenarios that still matter. New tests should exercise observable outcomes through the interface rather than mirror the implementation.

Update existing domain documentation directly when the accepted change makes its terms or decisions inaccurate. Use the project's glossary and ADR conventions. Create new documentation only when the change needs it or the user requests it.

### 4. Verify and report

Exercise the affected behaviour through the module's interface or the user's workflow. Run relevant existing tests and the project's required checks, scaled to the change. If a check fails, investigate and fix the cause within the selected scope, then rerun it. A build alone does not demonstrate that the affected behaviour works.

Inspect the final diff and references to replaced modules. Report the actual changes, affected callers, verification results, and any checks that could not be run. Distinguish source or unit evidence from real application or external-system verification. Describe the improvement as verified only to the extent supported by those results.

Check that the final implementation follows the selected responsibility, interface, and dependency design. Compare each original completion criterion with actual evidence and report it as met, unmet, or unverified. Do not lower the criteria to fit the implementation.
