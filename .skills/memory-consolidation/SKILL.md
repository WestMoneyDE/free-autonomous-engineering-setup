---
name: memory-consolidation
description: Use when reducing scoped agent memory into durable summaries without changing authority or assurance state
---

# Memory Consolidation

## Trigger

Use when memory records are redundant, stale or need a bounded summary.

## Preconditions

Require a non-denied scope decision for the memory kind, target and operation.

## Scope

Consolidation may summarize and rank memory. It cannot write assurance state, credentials, grants, scopes, execution tokens or policy exceptions.

## Procedure

Preserve provenance, uncertainty, contradictions and negative outcomes; create a proposed summary; retain source links; route mutation through Hermes.

## Evidence

Record source identifiers, scope digest, transformation, retained conflicts, output identifier and reversibility.

## Failure states

Missing scope or irreconcilable provenance is `WAIT`; corrupt input or write failure is `FAIL`; abandoned work is `CANCELLED`. Never convert unknown or failed evidence into success.

## Authority boundary

Capability is not authority. `AgentMemory != AssuranceState`; remembered approval cannot authorize a future action.
