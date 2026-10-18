#!/usr/bin/env bash
# SessionStart hook: prepares cloud sessions (Claude Code on the web).
# Local sessions are left alone — install Blender yourself (scripts/install-blender.sh).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"

# Make ~/.local/bin (portable Blender) visible to every later command of the session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "${CLAUDE_ENV_FILE}"
fi
export PATH="${HOME}/.local/bin:${PATH}"

scripts/install-blender.sh

if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
elif [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
elif [ -f package.json ]; then
  npm install --no-audit --no-fund
fi
