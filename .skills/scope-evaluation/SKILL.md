---
name: scope-evaluation
description: Use when a proposed repository, memory, tool or effect operation must be checked against explicit scope
---

# Scope Evaluation

## Trigger

Use before retrieval, consolidation, file/tool dispatch or effect proposal.

## Preconditions

Require the exact request and current scope envelope; absent dimensions stay unknown.

## Scope

The local evaluator checks role, tool, memory kind, capability, target and path only. Budget, time, occurrences, externality, reversibility, approval, data/retention classes and source versions require downstream gates.

## Procedure

Evaluate supported dimensions. `DENY` stops; `DEFER` means `WAIT`; only `ALLOW` or `NARROW` satisfies this local precondition. Route permitted proposals to Hermes and any separate dispatch/effect gate.

## Evidence

Record request, verdict, effective scope, reasons, unresolved dimensions and digest.

## Failure states

Unsupported required dimensions are `WAIT`, evaluator failure is `FAIL`, and withdrawal is `CANCELLED`; none is authorization.

## Authority boundary

Capability is not authority. `ScopeDecision != ExternalApproval` and `ScopeDecision != DispatchAuthorization`.
