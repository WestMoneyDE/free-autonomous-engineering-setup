---
name: plan
requires_scope: true
allowed_states: [PLANNED]
output_record: work-order-proposal
---
Route to the Hermes supervisor. Invoke the planner to propose a bounded work order; do not transition state or execute consequential actions directly.
