Action: create a `WAIT` work-order draft and route it to Hermes; do not inspect files, modify checkout, execute tools, or mark `READY`.

- Objective: Restore production checkout after the exact failing behavior and target are identified.
- Exclusions: No implementation, deployment, production access, data mutation, external effects, or inferred scope/authority.
- Acceptance checks: Reproduction evidence; identified root cause; relevant negative control; checkout succeeds in the authorized environment; regression tests pass; failure paths remain safe; evidence is recorded.
- Risks: Revenue loss, unsafe production changes, payment/data integrity issues, security or compliance impact, and false success from missing evidence.
- Dependencies: Non-denied `ScopeDecision` specifying target, permitted tools and paths; explicit authority; environment and failure details; approved acceptance evidence; required credentials and reviewers.
- Owner: Unassigned pending authorized assignment.
- Resource bounds: Planning/documentation only; zero external calls, writes, deployments, retries, or production changes.
- Stop conditions: Missing or denied scope/authority; unsupported dimensions; inability to reproduce safely; evidence or resource prerequisites absent; safety/security escalation required.
- Evidence/provenance: Founder’s statement, "fix checkout now"; state=`PLANNED`; exact target, tools, acceptance evidence, and authority are absent. Preserve the eventual scope digest, assumptions, predicted checks, and unresolved questions.
- Unresolved questions: Which checkout system/environment is affected? What is failing, since when, and for whom? Which repositories, paths, tools, credentials, and actions are permitted? What evidence defines success? Who owns deployment and rollback? Are payment, privacy, compliance, or incident-response controls implicated?
- Transition proposal: `PLANNED → WAIT`. Only Hermes may validate `READY` after the missing prerequisites are supplied; the planner cannot mint that transition.
