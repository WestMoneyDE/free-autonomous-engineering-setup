# Demo project — fresh-agent recovery walkthrough

Run the full supervised loop locally (no model, no network, no cost):

```bash
node examples/demo-project/run-demo.mjs          # throwaway run
node examples/demo-project/run-demo.mjs --keep   # keep .state for inspection
```

It exercises: work-order validation → canonical state machine → dispatch
guards + lease → structured builder return (proposal only) → independent
review (reviewer ≠ builder enforced) → completion gated on PASS evidence →
event-sourced recovery check (replay == snapshot).

A fresh agent resuming a real project reads, in order:
`brain/STATE.json` → `CURRENT-WORK-ORDER.md` → `.state/sessions/` (latest
checkpoint) → `.state/evidence/`. Nothing depends on chat history.
