#!/bin/sh
# Select the Node version from .nvmrc for git hooks. The login shell may still
# be Node 18 (system); commitlint/ts-jest/better-sqlite3 need the project Node.
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ -s "$ROOT/.nvmrc" ]; then
  MAJOR=$(tr -d 'v\n\r ' < "$ROOT/.nvmrc")
  for BASE in "$HOME/.nvm/versions/node" "/root/.nvm/versions/node"; do
    BIN=$(ls -d "$BASE/v${MAJOR}"*/bin 2>/dev/null | sort -V | tail -1)
    if [ -n "$BIN" ]; then
      PATH="$BIN:$PATH"
      export PATH
      break
    fi
  done
fi
