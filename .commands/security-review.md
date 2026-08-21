---
name: security-review
requires_scope: true
allowed_states: [READY_FOR_REVIEW]
output_record: security-verdict
---
Route to the Hermes supervisor. Security tools require their own exact authorization and preflight; this command never executes Strix or another consequential action directly.
