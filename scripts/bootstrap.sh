#!/usr/bin/env bash
set -euo pipefail

APPLY=false
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--apply]" >&2
  exit 2
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[FAIL] Missing required command: $1" >&2
    exit 1
  fi
}

need git
need node
need npm
need npx

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 20 )); then
  echo "[FAIL] Node.js 20+ is recommended by this starter; found $(node --version)." >&2
  exit 1
fi

echo "[OK] git  $(git --version)"
echo "[OK] node $(node --version)"
echo "[OK] npm  $(npm --version)"

echo
echo "Planned integration:"
echo "  OmniRoute endpoint: http://localhost:20128/v1"
echo "  DeepSeek Harness UI: http://127.0.0.1:3080"
echo "  DSH provider template: config/dsh-omniroute.settings.example.yaml"

if [[ "$APPLY" == "true" ]]; then
  echo
echo "[APPLY] Installing OmniRoute globally through npm..."
  npm install -g omniroute
  omniroute --version
else
  echo
echo "Dry run only. No package was installed and no settings were modified."
  echo "Run '$0 --apply' to install OmniRoute globally, or use 'npx omniroute' without installation."
fi

echo
echo "Next terminals:"
echo "  1) npx omniroute"
echo "  2) npx @deepseek-ai/dsh web"
echo
echo "Then add OmniRoute in DSH Settings -> Models as documented in docs/INSTALLATION.md."
