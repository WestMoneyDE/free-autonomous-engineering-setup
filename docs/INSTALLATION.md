# Installation

This guide installs the integration without copying third-party source code into this repository.

## 0. Requirements

Recommended for this starter:

- Git
- Node.js 20+
- npm / npx
- curl for command-line endpoint checks (optional on Windows if you prefer PowerShell)

Check:

```bash
git --version
node --version
npm --version
```

Clone this repository:

```bash
git clone https://github.com/WestMoneyDE/free-autonomous-engineering-setup.git
cd free-autonomous-engineering-setup
npm test
```

The bootstrap scripts are dry-run/preflight by default:

```bash
bash scripts/bootstrap.sh
```

or:

```powershell
pwsh -File scripts/bootstrap.ps1
```

Pass `--apply` / `-Apply` only if you want the script to globally install OmniRoute. DeepSeek Harness remains an on-demand `npx` launch so the script does not silently modify its rapidly changing developer-preview configuration.

---

## 1. Install or run OmniRoute

### Option A — no global install

```bash
npx omniroute
```

Upstream's quickstart serves the OpenAI-compatible API at:

```text
http://localhost:20128/v1
```

List available models:

```bash
curl http://localhost:20128/v1/models
```

### Option B — global CLI

```bash
npm install -g omniroute
omniroute --version
omniroute setup
omniroute
```

Use `omniroute setup` to add or configure provider connections. Provider/API availability and free tiers change over time; use the current OmniRoute UI/catalog rather than treating this repository's examples as a permanent provider inventory.

### Local endpoint authentication

OmniRoute's public quickstart examples use any non-empty bearer token for the default local endpoint, such as `dummy-key`. Do not reuse that convention for a shared or remotely exposed gateway. Configure a real endpoint key and network access controls for remote use.

---

## 2. Run DeepSeek Harness

Upstream's npm launch is:

```bash
npx @deepseek-ai/dsh web
```

The local Web UI starts on:

```text
http://127.0.0.1:3080
```

DeepSeek Harness is currently marked **developer preview** by its maintainers. Expect compatibility-breaking changes and pin/review upgrades before unattended production use.

### Optional: run DSH from source

Use the upstream method if you need to develop the harness itself:

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

This repository does not require a source checkout for normal use.

---

## 3. Connect DSH to OmniRoute

### Recommended: Web UI

Start both processes, then in DSH:

1. Open **Settings → Models**.
2. Choose **Add a custom provider**.
3. Provider ID: `omniroute`.
4. Base URL: `http://127.0.0.1:20128/v1`.
5. API protocol: `openai-completions`.
6. Credential: for a local quickstart, `dummy-key`; for shared/remote use, your actual endpoint key.
7. Add model `auto/coding` or use **Fetch available models** if the endpoint/model list is reachable from the UI.
8. Save.
9. Select `omniroute / auto/coding` for a **new** coding session.

DSH records a selected model in an active session, so start a new session when intentionally changing routing behavior for a task.

### Configuration-as-code

The generic DSH multi-provider adapter supports hand-declared OpenAI-compatible gateways. Use this repository's example:

[`config/dsh-omniroute.settings.example.yaml`](../config/dsh-omniroute.settings.example.yaml)

Merge the `llm-pi-ai` section into your existing DSH settings. Do not replace unrelated DSH settings.

The example uses:

```yaml
api: openai-completions
baseURL: http://127.0.0.1:20128/v1
apiKeyEnv: OMNIROUTE_API_KEY
```

and conservative compatibility switches:

```yaml
compat:
  supportsDeveloperRole: false
  maxTokensField: max_tokens
```

These switches are appropriate when an OpenAI-compatible gateway rejects OpenAI-specific `developer` roles or `max_completion_tokens`. If your current OmniRoute/DSH versions accept the native shape without them, test and simplify deliberately rather than guessing.

Set the referenced key in the environment, not Git:

Bash:

```bash
export OMNIROUTE_API_KEY=dummy-key
```

PowerShell:

```powershell
$env:OMNIROUTE_API_KEY = "dummy-key"
```

Use a real endpoint key outside the local-only quickstart.

---

## 4. Select a routing policy

Start with:

```text
auto/coding
```

Other useful routes:

```text
auto/coding:fast
auto/coding:cheap
auto/coding:reliable
auto/coding:free
auto/reasoning:pro
```

Read [ROUTING.md](ROUTING.md) before relying on `:free`: upstream's candidate filter is fail-open when no candidate satisfies the filter, so it is not a hard zero-cost guarantee.

---

## 5. Adopt the repository operating contract in a project

For any project you want DSH to work on, copy/adapt these files conceptually or directly:

- `AGENTS.md` — invariant and permission contract;
- `templates/WORK-ORDER.md` — bounded task definition;
- `templates/SESSION-REPORT.md` — durable checkpoint;
- `docs/MEMORY-AND-STATE.md` — memory/provenance model;
- `docs/SECURITY-AND-AUTHORITY.md` — human authority boundary.

Do not let a generic starter overwrite stricter project-specific security or compliance rules.

---

## 6. Verification checklist

Run repository self-check:

```bash
npm test
```

Check OmniRoute:

```bash
curl http://localhost:20128/v1/models
```

Check DSH:

- Web UI is reachable at `http://127.0.0.1:3080`.
- `omniroute` appears as a configured provider.
- `auto/coding` is selectable for a new session.
- A harmless repository-read task can complete without external side effects.

Then test a bounded coding task in a disposable branch before enabling broader autonomous operation.

---

## 7. Upgrade discipline

Before upgrading DSH or OmniRoute:

1. read upstream release notes;
2. preserve/export current configuration;
3. validate the custom provider route;
4. run a read-only smoke task;
5. run a small coding task with tests;
6. inspect routing/cost telemetry;
7. only then promote the new version to regular use.

Never treat a successful package installation as proof that routing, authority gates or budget behavior remain semantically unchanged.
