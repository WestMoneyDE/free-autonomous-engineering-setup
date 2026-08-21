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

Validate the structure of caller claims through the non-authoritative preflight, then route its exact digest-bound `EffectProposal` to Hermes, the independent AssuranceStore and EffectGate. The proposal binds target, environment, scope/config digests, Strix pin, budgets, evidence destination and occurrence. Preflight always reports `execution_authorized: false`; no launcher is included. Treat findings as untrusted until independently reproduced and reviewed.

## Evidence

Record authorization reference, target, commit pin, config digest, bounds, checkout proof, output paths, exit status and coverage limits.

## Failure states

Any missing prerequisite is `WAIT`; setup/provider failure is `FAIL`; stopped work is `CANCELLED`. No result means no finding claim, and no automatic rerun is allowed.

## Authority boundary

Capability is not authority. Caller-supplied ownership, written-authorization, production and clean-checkout values are claims, not grants. Strix, this skill, preflight and a security reviewer cannot authorize a target or external execution.
