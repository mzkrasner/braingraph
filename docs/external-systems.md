# External-System Contract

Braingraph does not assume that a workspace uses any particular vendor. Every external system is evaluated through the same contract.

## Required Decisions

1. **Status:** Is the integration active, planned but unavailable, or inactive but retained for provenance?
2. **Ownership:** What information remains canonical in the external system?
3. **Role:** Is it a source, intake channel, execution system, communication system, reference, or archive?
4. **Record identity:** Which stable native identifiers and links should be preserved instead of display titles?
5. **Freshness:** Must an agent verify the live system before making a current-state claim?
6. **Read boundary:** What may agents retrieve, and through which approved mechanism?
7. **Write boundary:** Are writes prohibited, approval-gated, or explicitly delegated? Delegated access must name its narrow scope.
8. **Capture mode:** Should content be linked, summarized, synchronized, copied, or excluded by default?
9. **Sensitivity:** Which privacy, security, contractual, or regulatory constraints apply?
10. **Failure behavior:** What should happen when the connector is unavailable, a revision changes, or evidence conflicts?
11. **Account identity:** Which provider account, tenant, and/or authenticated principal is allowed for this brain? What live identity evidence can the connector supply before retrieving content?

## Guiding Rule

Copy durable knowledge only when the workspace should own it. Otherwise preserve a stable link and a concise synthesis, and verify volatile facts in the system that owns them.

Use `braingraph system update` when this contract changes. Mark prospective integrations `planned`; prefer `inactive` over deletion for retired systems so earlier source citations and decisions remain understandable.

## Multiple Brains and Accounts

Each brain has its own manifest, local connector mappings, and authority boundaries. Two brains can use the same provider and even the same external-system ID without sharing a selected account. Braingraph has no global "current brain," default account, or fallback connector. Pass `--workspace <directory>` when operating outside the intended workspace; from inside a brain, commands resolve its nearest ancestor manifest.

An authenticated connection on the machine is not sufficient evidence that it belongs to this brain. Before reading content, synchronizing, or writing, resolve the selected connector's live identity using its provider-supported identity or profile mechanism. Compare every declared constraint. If identity is unavailable, ambiguous, or mismatched, stop and report the binding problem. Do not probe another account's content to identify it, silently try the next connected account, or use a cached note as authentication evidence.

An explicit user-approved cross-brain workflow must identify both brains, permitted information, source account, and destination. Shared provider availability, matching display names, or similar project names never authorize combining their data. Record provenance with its source system/account context when native record IDs alone could collide.

### Portable Expectations versus Local Bindings

| Location                                             | Contents                                                                | Meaning                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `braingraph.json` → `externalSystems[].identity`     | Optional non-secret `account`, `tenant`, and/or `principal` constraints | Which provider-reported identity is expected for this brain        |
| `braingraph.local.json` → `systemBindings[systemId]` | A connector instance ID, its observed identity, and `recordedAt`        | A machine-local selection aid; not proof of current authentication |
| Live provider identity response                      | Current identity of the selected connector                              | Evidence to check immediately before the scoped operation          |

Use canonical, stable values supplied by the provider. Comparisons are exact and case-sensitive; Braingraph does not guess provider-specific normalization rules. `account` can be an account ID or canonical mailbox address, `tenant` an organization/workspace ID, and `principal` an authenticated user or service-principal ID. Declare whichever fields constrain the intended account; declare multiple fields when one alone would be ambiguous. Empty identity objects and unrecognized fields are invalid.

The identity object is additive: older manifests and public/manual sources without identity constraints still validate. Their connector status is **unbound**, not implicitly approved. Declare expected identity and a local binding before agent connector operations. This does not prohibit manually reading a public reference URL under its existing contract.

These values are non-secret but may still be private. Do not publish a private manifest without reviewing them. Never put passwords, session cookies, OAuth tokens, API keys, or credential-store contents in either file. The local file is ignored by the generated Git configuration, is scoped to the workspace, and should not be copied when sharing a scaffold. Field validation rejects unknown credential-shaped fields; it cannot detect a secret pasted into an otherwise valid identifier string.

### Binding Workflow

The following values are fictional. For a real integration, obtain observations from the selected connector rather than copying these examples or the saved binding.

```sh
# Add expected identity to a previously registered source contract.
braingraph system update mail --workspace ./research-brain \
  --expected-account research@example.invalid --expected-tenant example-research

# After inspecting that connector's live identity, preview then record its mapping.
braingraph system bind mail --workspace ./research-brain \
  --connector mail-session-a --account research@example.invalid \
  --tenant example-research --dry-run
braingraph system bind mail --workspace ./research-brain \
  --connector mail-session-a --account research@example.invalid \
  --tenant example-research

# Configuration status does not contact the provider or verify authentication.
braingraph system status --workspace ./research-brain --json

# Supply freshly observed identity before the scoped operation.
braingraph system check mail --workspace ./research-brain \
  --connector mail-session-a --account research@example.invalid \
  --tenant example-research
```

`system check` returns a nonzero result for undeclared expected identity, missing local binding, a non-active integration, a different connector, an omitted expected field, or any mismatch. It checks both the portable constraints and all identity fields saved in the local binding. A contract update that changes the account leaves the old mapping visibly mismatched until the human intentionally binds the correct connector. Clear an expected field with `--expected-account=`, `--expected-tenant=`, or `--expected-principal=`; clearing all fields leaves connector operations unbound. Changing a connection or authenticated principal requires fresh inspection and rebinding, not editing around a failed check.

`system status` distinguishes `unbound`, `configured`, `mismatch`, and `inactive`. `configured` means only that saved values agree. `recordedAt` means when the mapping was recorded, not when the provider was last verified. `system check` itself makes no network request: it validates the caller's supplied observations. Agents must not pass saved values and present that as a live check.

Braingraph is not an OAuth broker or a sandbox for third-party tools. Its commands and instructions cannot enforce a provider's authentication or prevent another client from bypassing these checks. A passing identity comparison is never permission to read, copy, synchronize, or write: declared access, capture limits, sensitivity, delegated scope, and required human approval still govern the operation. Provider-side credentials and scopes remain the actual security boundary.
