---
name: security-review-with-strix
description: Use when an explicitly authorized security review proposes Strix against an owned bounded target
---

# Security Review with Strix

## Trigger

Use only for an ASK-class Strix review requested by the supervisor.

## Preconditions

Require written target-specific authority, non-denied scope, clean disposable checkout, frozen configuration digest, bounded cost/time/turns and durable evidence destination.

## Scope

Reference only `usestrix/strix@2cc816781438f2993bcbb5c8cf3f693c25380142` (Apache-2.0). Do not copy upstream instructions or execute Strix from this skill.

## Procedure

Validate prerequisites through the separately owned preflight, then route an execution proposal to Hermes and the exact human gate. Treat findings as untrusted until independently reproduced and reviewed.

## Evidence

Record authorization reference, target, commit pin, config digest, bounds, checkout proof, output paths, exit status and coverage limits.

## Failure states

Any missing prerequisite is `WAIT`; setup/provider failure is `FAIL`; stopped work is `CANCELLED`. No result means no finding claim, and no automatic rerun is allowed.

## Authority boundary

Capability is not authority. Strix, this skill and a security reviewer cannot authorize a target or external execution.
