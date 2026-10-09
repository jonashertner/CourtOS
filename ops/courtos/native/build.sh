#!/usr/bin/env bash
# Build an operator-selected release checkout. Does not install/start services.
set -euo pipefail
umask 022
release=$(cd "${1:?Usage: build.sh RELEASE_CHECKOUT NODE_BIN_DIR [PYTHON]}" && pwd)
node_bin=${2:?Node binary directory required}
python_bin=${3:-python3}
export PATH="$node_bin:$PATH"
test "$(node --version)" = v22.23.3
export NEXT_TELEMETRY_DISABLED=1 SENTRY_DISABLED=true SENTRY_INSTALL=false
export NEXT_PUBLIC_SENTRY_DISABLED=true NEXT_PUBLIC_SENTRY_INSTALL=false
export NEXT_PUBLIC_COURTOS_PILOT_MODE=true NEXT_PUBLIC_COURTOS_AUTH_MODE=cloudflare
export NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION=${NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION:-false}
case "$NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION" in true|false) ;; *) printf '%s\n' 'Self-registration build flag must be true or false.' >&2; exit 1 ;; esac
npm ci --prefix "$release/backend"
npm run build --prefix "$release/backend"
npm ci --prefix "$release/frontend"
npm run build --prefix "$release/frontend"
"$python_bin" -m venv "$release/hybrid/.venv"
"$release/hybrid/.venv/bin/python" -m pip install --disable-pip-version-check -r "$release/hybrid/requirements.txt"
"$release/hybrid/.venv/bin/python" -m pip check
printf '%s\n' 'Build complete. No service or database was changed.'
