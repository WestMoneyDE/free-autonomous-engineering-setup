---
name: verify-evidence
description: Use when deciding whether implementation claims have fresh sufficient reproducible evidence
---

# Verify Evidence

## Trigger

Use before any completion or review-readiness claim.

## Preconditions

Require a non-denied scope decision and the current work order's acceptance checks.

## Scope

Verification observes and records; it does not widen scope, approve the builder or perform external actions.

## Procedure

Run fresh permitted checks, map each claim to output and provenance, distinguish not-run from unknown, and route the evidence packet to Hermes.

## Evidence

Include command, time, source revision, exit code, relevant output, coverage limits and negative results. Old or self-reported success is contextual only.

## Failure states

Cancelled checks are `CANCELLED`; provider/network failures are `WAIT` or `FAIL`; missing results remain unknown. None counts as a pass.

## Authority boundary

Capability is not authority. Evidence supports a supervisor decision but cannot mint approval, scope or `DONE`.
