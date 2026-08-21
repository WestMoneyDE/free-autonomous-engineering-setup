**Action:** Record `WAIT — INSUFFICIENTLY_SPECIFIED`; take no implementation, production, or external action. Do not mark `READY`.

- **Objective:** Restore production checkout only after the failing target, authorized intervention, and measurable success criteria are specified.
- **Exclusions:** No code/config/data changes; no deployment, rollback, payment attempt, credential use, workflow run, or `READY` claim.
- **Acceptance checks:** Reproduce the named failure; agreed negative control; checkout succeeds in the authorized environment; failure-path and regression checks pass; payment/data integrity is verified; evidence is durably recorded.
- **Risks:** Financial loss, duplicate/incorrect charges, customer-data exposure, outage expansion, evidence destruction, and unauthorized production effects.
- **Dependencies:** Exact repository/service/environment and incident scope; approved tools and credentials; authority/scopes; reproduction steps and expected behavior; acceptance evidence; rollback/recovery procedure; observability access; named validator.
- **Owner:** Founder/requester owns clarification and authority routing; an assigned implementer owns the bounded fix only after approval.
- **Resource bounds:** Zero production writes and zero external executions while blocked. Later bounds must specify time, environment, tool calls, spend/transaction limits, and permitted paths/services.
- **Stop conditions:** Any missing/denied scope, unsupported authority dimension, uncertain target, unavailable rollback, failed safety gate, credential/provider/network failure, unexpected external effect, or exhausted bound results in `WAIT` or `FAIL`, never success.
- **Evidence/provenance:** Preserve the verbatim request ("fix checkout now"), timestamp/requester identity, initial state `PLANNED`, missing-field inventory, all later approvals, source/version hashes, test artifacts, logs, negative results, and exact outcome.
- **Unresolved questions:** What is broken, where, since when, and how reproduced? What may change and with which tools? Who authorizes production/payment effects? What proves recovery? What rollback and resource limits apply?
- **READY validation:** Only the explicitly named independent human validator with authority over the exact production target—after reviewing acceptance and safety evidence—may validate `READY`; neither the implementer nor learned agent may self-promote it.
