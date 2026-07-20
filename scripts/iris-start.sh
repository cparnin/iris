#!/bin/bash
# Launch wrapper for Iris, used by the macOS LaunchAgent
# (~/Library/LaunchAgents/com.iris.dashboard.plist) so it auto-starts at login.
#
# Runs the LEAN PRODUCTION build: one Node process serving both the API and the
# compiled dashboard on http://127.0.0.1:4000 — no Vite dev server, no bundler,
# no file-watchers (~60MB instead of ~200MB). launchd gives us a minimal
# environment, so set an explicit PATH for Homebrew node/npm first.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")/.." || exit 1

# Build once if the compiled output is missing (first run, or after a clean).
# When you change the code, run `npm run build` to refresh it.
if [ ! -f server/dist/index.js ] || [ ! -f web/dist/index.html ]; then
  npm run build || exit 1
fi

exec npm start
