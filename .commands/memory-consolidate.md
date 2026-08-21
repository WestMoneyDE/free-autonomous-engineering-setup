---
name: memory-consolidate
requires_scope: true
allowed_states: [IN_PROGRESS]
output_record: memory-proposal
---
Route to the Hermes supervisor. Produce a reversible memory proposal with provenance; never write assurance state or create authority.
