# External-System Contract

Braingraph does not assume that a workspace uses any particular vendor. Every external system is evaluated through the same contract.

## Required Decisions

1. **Status:** Is the integration active, planned but unavailable, or inactive but retained for provenance?
2. **Ownership:** What information remains canonical in the external system?
3. **Role:** Is it a source, intake channel, execution system, communication system, reference, or archive?
4. **Identity:** Which stable native identifiers and links should be preserved instead of display titles?
5. **Freshness:** Must an agent verify the live system before making a current-state claim?
6. **Read boundary:** What may agents retrieve, and through which approved mechanism?
7. **Write boundary:** Are writes prohibited, approval-gated, or explicitly delegated? Delegated access must name its narrow scope.
8. **Capture mode:** Should content be linked, summarized, synchronized, copied, or excluded by default?
9. **Sensitivity:** Which privacy, security, contractual, or regulatory constraints apply?
10. **Failure behavior:** What should happen when the connector is unavailable, a revision changes, or evidence conflicts?

## Guiding Rule

Copy durable knowledge only when the workspace should own it. Otherwise preserve a stable link and a concise synthesis, and verify volatile facts in the system that owns them.

Use `braingraph system update` when this contract changes. Mark prospective integrations `planned`; prefer `inactive` over deletion for retired systems so earlier source citations and decisions remain understandable.
