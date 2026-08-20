# Installation

This setup has three runtime layers: **Hermes Supervisor → DeepSeek Harness → OmniRoute**.

## 0. Requirements

- Git
- Node.js 20+
- npm / npx
- a working Hermes Agent installation for the supervisor layer

Clone and validate:

```bash
git clone https://github.com/WestMoneyDE/free-autonomous-engineering-setup.git
cd free-autonomous-engineering-setup
npm test
```

## 1. Start OmniRoute

No global install required:

```bash
npx omniroute
```

Local OpenAI-compatible endpoint:

```text
http://localhost:20128/v1
```

Optional global install:

```bash
npm install -g omniroute
omniroute setup
omniroute
```

## 2. Start DeepSeek Harness

```bash
npx @deepseek-ai/dsh web
```

Local UI:

```text
http://127.0.0.1:3080
```

DeepSeek Harness is currently **developer preview**; pin/review upgrades before unattended operation.

## 3. Connect DSH to OmniRoute

In DSH open **Settings → Models → Add a custom provider**:

```text
Provider ID: omniroute
Base URL:    http://127.0.0.1:20128/v1
Protocol:    openai-completions
API key:     dummy-key          # local quickstart only
Model:       auto/coding
```

Or merge [`../config/dsh-omniroute.settings.example.yaml`](../config/dsh-omniroute.settings.example.yaml) into DSH settings.

## 4. Prepare each project for Hermes supervision

Hermes should consume a compact durable interface, for example:

```text
brain/STATE.json
CURRENT-WORK-ORDER.md
.state/tasks/
.state/sessions/
.state/evidence/
```

Minimum state fields:

```json
{
  "project": "my-project",
  "status": "READY",
  "active_work_order": null,
  "branch": "main",
  "blocker": null,
  "next_action": null
}
```

Adopt `AGENTS.md`, the work-order/session templates, memory rules and security/authority rules in every supervised project.

## 5. Configure Hermes as external supervisor

Hermes should:

1. read the compact project state;
2. map `READY` to an implementation worker;
3. map `READY_FOR_REVIEW` to an independent reviewer;
4. map `CHANGES_REQUESTED` back to implementation;
5. map `BLOCKED`/`WAIT_PROVIDER` to stop/bounded wait;
6. map `FOUNDER_REQUIRED` to the human channel;
7. use duplicate-run locks;
8. never infer approval;
9. persist every state transition.

The exact Hermes command/plugin wiring can vary by local installation. The architectural contract is specified in [`HERMES-SUPERVISOR.md`](HERMES-SUPERVISOR.md).

## 6. Routing policy

Start with `auto/coding`. Other useful routes include `auto/coding:fast`, `auto/coding:cheap`, `auto/coding:reliable`, `auto/coding:free` and `auto/reasoning:pro`.

Read [ROUTING.md](ROUTING.md) before relying on `:free`; it is free-preferred, not a hard zero-cost guarantee.

## 7. Smoke test

Use a disposable branch and a harmless work order:

```text
STATE = READY
  ↓
Hermes dispatches DSH
  ↓
DSH uses OmniRoute
  ↓
small local change + test
  ↓
READY_FOR_REVIEW
  ↓
Hermes dispatches independent reviewer
  ↓
PASS
  ↓
DONE
```

Confirm no push/deploy/external action occurs without the configured human gate.

## 8. Upgrade discipline

Upgrade one layer at a time. Preserve/export configuration, run read-only smoke tests, then a bounded coding task, verify state transitions/locks, inspect routing/cost telemetry, and only then promote the new version.
