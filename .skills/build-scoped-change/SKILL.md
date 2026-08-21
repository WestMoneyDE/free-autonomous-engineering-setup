---
name: build-scoped-change
description: Use when implementing a repository change under an accepted work order and explicit scope
---

# Build Scoped Change

## Trigger

Use for implementation in `READY` or `CHANGES_REQUESTED`.

## Preconditions

Require a non-denied scope decision, bounded work order and named acceptance checks.

## Scope

Touch only permitted paths and tools. Stop at any external, destructive or newly discovered boundary.

## Procedure

Implement the smallest change, add or update tests, run local checks, record the diff and submit evidence to Hermes. Propose `READY_FOR_REVIEW`; do not set it yourself.

## Evidence

Record scope digest, files changed, commands, exit codes, failures and unverified claims.

## Failure states

Provider or network interruption is `WAIT` or `FAIL`, never success. Persist `CANCELLED` exactly and do not auto-rerun one-shot actions.

## Authority boundary

Capability is not authority. Builder skill, history and test success cannot expand scope or authorize push, deployment or publication.
