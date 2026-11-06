#!/bin/bash
set -euo pipefail

workspace="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime="$workspace/.rea/runtime/node_modules/.bin/node"
entry="$workspace/node_modules/rea-agents/scripts/rea.mjs"

if [[ ! -x "$runtime" || ! -f "$entry" ]]; then
    printf '%s\n' 'REA is not installed. See README.md for restoration steps.' >&2
    exit 1
fi

export PATH="$workspace/.rea/runtime/node_modules/.bin:$PATH"
exec "$runtime" "$entry" "$@"
