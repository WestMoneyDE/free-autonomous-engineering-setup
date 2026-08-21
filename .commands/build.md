---
name: build
requires_scope: true
allowed_states: [READY, CHANGES_REQUESTED]
output_record: implementation-evidence
---
Route to the Hermes supervisor. Dispatch a builder only within effective scope; do not push, deploy or transition state directly.
