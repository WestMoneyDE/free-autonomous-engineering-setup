---
name: checkpoint
requires_scope: true
allowed_states: [PLANNED, READY, IN_PROGRESS, READY_FOR_REVIEW, CHANGES_REQUESTED, BLOCKED, WAIT_PROVIDER, FOUNDER_REQUIRED, APPROVED_FOR_EXTERNAL_ACTION, DONE, FAIL, CANCELLED]
output_record: session-checkpoint
---
Route to the Hermes supervisor. Persist exact state, evidence, blockers and next action; this command performs no external action or state transition directly.
