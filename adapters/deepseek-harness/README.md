# DeepSeek Harness adapter

DSH is the worker runtime of this setup (see docs/ARCHITECTURE.md). Wiring:

1. Provider: merge `config/dsh-omniroute.settings.example.yaml` into your DSH
   settings (never overwrite unrelated settings). OmniRoute stays the single
   routing plane; DSH consumes route IDs like `auto/coding` as model IDs.
2. Task input: the supervisor's dispatch packet (`src/supervisor/dispatcher.mjs`)
   is the bounded task contract. Paste/inject it as the worker task; DSH must
   return the structured `WorkerResult` shape (`src/workers/contracts.mjs`).
3. Policy: DSH executes tools locally. Until DSH exposes a pre-tool hook API,
   enforce the deny-class at the OS/repository level (no credentials in the
   worktree, `.state/assurance/` outside the worker's write scope) and treat
   every ASK-class action as an EffectProposal that must pass the effect gate
   before a human executes it. Direct worker → external world execution of
   consequential actions is out of contract.

DSH is upstream **developer preview** (`@deepseek-ai/dsh`); pin versions
(`npx @deepseek-ai/dsh@0.1.0-rc.7 web`) and re-validate after upgrades.
