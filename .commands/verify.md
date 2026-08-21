---
name: verify
requires_scope: true
allowed_states: [IN_PROGRESS, READY_FOR_REVIEW]
output_record: verification-evidence
---
Route to the Hermes supervisor. Run only permitted local checks and record exact outcomes; never infer success or set DONE directly.
