---
name: independent-review
description: Use when evaluating a completed scoped diff and evidence packet as a reviewer independent from the builder
---

# Independent Review

## Trigger

Use in `READY_FOR_REVIEW` when reviewer identity is independent of the builder.

## Preconditions

Require a non-denied scope decision, actual diff, work order and fresh evidence packet.

## Scope

Review may issue a verdict proposal; it may not alter the implementation or approve external effects.

## Procedure

Check scope compliance, acceptance criteria, failure paths, tests and authority boundaries. Record `APPROVE`, `CHANGES_REQUESTED` or `BLOCKED` with file-specific evidence and route it to Hermes.

## Evidence

Cite inspected revisions, diff locations, commands and unresolved risks. Separate verified facts from inference.

## Failure states

Missing independence or evidence is `WAIT`; invalid evidence is `FAIL`; an ended review is `CANCELLED`. Do not approve under uncertainty.

## Authority boundary

Capability is not authority. Reviewer verdicts are inputs to Hermes, not self-executing transitions or deployment permission.
