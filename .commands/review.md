---
name: review
requires_scope: true
allowed_states: [READY_FOR_REVIEW]
output_record: review-verdict
---
Route to the Hermes supervisor. Dispatch an independent reviewer; the command does not merge, approve external action or transition state directly.
