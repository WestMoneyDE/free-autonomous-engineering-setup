---
name: scope-check
requires_scope: true
allowed_states: [PLANNED, READY, IN_PROGRESS, CHANGES_REQUESTED, READY_FOR_REVIEW]
output_record: scope-decision
---
Route the exact request to the Hermes supervisor scope engine. A ScopeDecision is neither external approval nor dispatch authorization.
