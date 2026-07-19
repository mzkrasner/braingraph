# External-System Contract

Braingraph does not assume that a workspace uses any particular vendor. Every external system is evaluated through the same contract.

## Required Decisions

1. **Ownership:** What information remains canonical in the external system?
2. **Role:** Is it a source, intake channel, execution system, communication system, reference, or archive?
3. **Identity:** Which stable identifiers and links should be preserved?
4. **Freshness:** Must an agent verify the live system before making a current-state claim?
5. **Read boundary:** What may agents retrieve, and through which approved mechanism?
6. **Write boundary:** Are writes prohibited, approval-gated, or explicitly delegated?
7. **Capture mode:** Should content be linked, summarized, synchronized, copied, or excluded?
8. **Sensitivity:** Which privacy, security, contractual, or regulatory constraints apply?
9. **Failure behavior:** What should happen when the connector is unavailable or evidence conflicts?

## Guiding Rule

Copy durable knowledge only when the workspace should own it. Otherwise preserve a stable link and a concise synthesis, and verify volatile facts in the system that owns them.
