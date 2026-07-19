# Braingraph Product Feedback

Use this workflow only after setup or adoption work reveals a likely Braingraph product gap.

## Qualification

File an issue when the evidence indicates repeatable product behavior, such as:

- a workspace shape, operating model, external system, or repository convention that the current design cannot represent cleanly;
- a brittle assumption that works only for a narrow environment;
- a safe workflow that requires undocumented manual intervention;
- diagnostics, commands, or instructions that are materially confusing; or
- a missing guardrail that could cause data loss, disclosure, or misleading agent behavior.

Do not file merely because credentials, network access, a third-party service, or a local tool is unavailable. First determine whether Braingraph should diagnose, document, or handle that condition better. Do not turn a one-person preference into a universal requirement without explaining the broader use case.

## Filing Workflow

1. Reproduce or otherwise verify the behavior using the least sensitive evidence available.
2. Check current Braingraph code and documentation to confirm the behavior is not already supported.
3. Search open and closed issues at `https://github.com/mzkrasner/braingraph/issues` using the affected capability and observed symptom. Add evidence to an existing issue when it already covers the gap.
4. Classify the issue as `Generalization gap`, `Bug`, `Usability`, `Documentation`, or `Integration`.
5. Draft the issue using the exact structure below. State observable outcomes and constraints; do not prescribe an implementation unless evidence requires it.
6. Remove credentials, source content, organization names, usernames, absolute paths, record identifiers, private URLs, and raw connector output. Use fictional replacements where reproduction needs concrete values.
7. Show the complete title and body to the human. Approval to run setup is not approval to file an issue.
8. After explicit approval, create the issue in `mzkrasner/braingraph` with an approved GitHub connector when available, then return the issue link. Do not create labels speculatively. If no approved write capability is available, return the complete ready-to-file draft and issue URL instead of installing tooling or requesting credentials solely to submit feedback.

## Required Issue Format

Title:

```text
[Classification] Capability: observable limitation
```

Body:

```markdown
## Summary

One concise paragraph describing the product gap and who it affects.

## Setup Context

- Braingraph version or commit:
- Installation method: repository clone | packaged CLI
- Environment: operating-system and runtime family only
- Workspace scope and enabled profiles:
- Relevant tools or external-system categories:

## Intended Outcome

What the user needed to accomplish and why that outcome is broadly useful.

## Observed Behavior

What happened, including the exact sanitized command or step when relevant.

## Why This Is a Braingraph Gap

Evidence that this is repeatable product behavior rather than local configuration, unavailable credentials, or a one-off preference.

## Minimal Reproduction

1. Use fictional, non-sensitive inputs.
2. List the smallest sequence that demonstrates the limitation.
3. Include the resulting sanitized output or state.

## Current Workaround

Describe the workaround, or state `None known`. Explain its cost or risk.

## Desired Product Outcome

Describe the capability or invariant that should become true without requiring a specific implementation.

## Acceptance Criteria

- [ ] State a testable user-visible outcome.
- [ ] Cover the relevant portability or generalization boundary.
- [ ] Preserve existing safety, idempotency, and authorization guarantees.
- [ ] Update diagnostics, documentation, schema, templates, or tests where applicable.

## Safety And Privacy Check

- [ ] No secrets, tokens, private source content, or raw connector payloads are included.
- [ ] No organization-specific identifiers, usernames, absolute paths, or private URLs are included.
- [ ] Reproduction data is fictional and non-sensitive.
- [ ] Existing open and closed issues were checked for duplicates.

## Additional Evidence

Optional sanitized logs, screenshots, links to public documentation, or related issue numbers.
```

Replace every instructional placeholder with case-specific content. Remove optional sections that truly do not apply; never submit the template as boilerplate with unresolved prompts.
