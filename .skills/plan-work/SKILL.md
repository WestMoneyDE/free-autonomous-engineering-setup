---
name: plan-work
description: Use when turning an approved objective into a bounded work order before implementation begins
---

# Plan Work

## Trigger

Use in `PLANNED` when a proposed objective needs an executable work order.

## Preconditions

A non-denied scope decision must identify the target, permitted tools and paths. Unknown dimensions remain unknown.

## Scope

Planning may propose work and evidence; it cannot approve execution or external effects.

## Procedure

Record objective, exclusions, acceptance checks, risks, dependencies, owner, resource bounds, stop conditions and the supervisor transition proposal. Route the record to Hermes; only Hermes validates `READY`.

## Evidence

Preserve the scope digest, assumptions, predicted checks and unresolved questions in the work order.

## Failure states

Missing scope or authority is `WAIT`; an invalid plan is `FAIL`; withdrawal is `CANCELLED`. Never relabel absence as success.

## Authority boundary

Capability is not authority. A planner cannot mint scope, approval, credentials or state transitions.
