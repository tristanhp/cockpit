#!/usr/bin/env bash
# Runs at the start of every Claude Code session (local and cloud), see .claude/settings.json.
# Idempotent: installs dependencies and builds the fictional demo database only when missing.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ ! -d node_modules ]; then
  echo "[session-start] installing dependencies"
  npm ci --no-audit --no-fund
fi

if [ ! -f data/demo.db ]; then
  echo "[session-start] building the demo database"
  npm run demo:setup >/dev/null
fi

echo "[session-start] ready. Next: read docs/PROGRESS.md and docs/WORKFLOW.md"
