#!/usr/bin/env bash
set -euo pipefail

# Named Docker volumes default to root:root; the container runs as pwuser.
# The Dockerfile pre-creates these paths owned by pwuser so fresh volumes
# inherit that, but chown anyway to repair volumes made before that change.
sudo chown pwuser:pwuser /home/pwuser/.local/share/opencode
sudo chown pwuser:pwuser /workspaces/soitax/tests/node_modules

# Test deps live under tests/ (jsdom). Install them there.
( cd /workspaces/soitax/tests && npm install )

echo "post-create.sh complete."
node --version
npx --yes playwright --version || true
opencode --version || true
