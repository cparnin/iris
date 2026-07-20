#!/bin/bash
# Remove the Polaris auto-start LaunchAgent installed by install-autostart.sh.
# Also boots out the pre-rebrand label if it's still lingering.
set -euo pipefail
for LABEL in com.polaris.dashboard com.iris.dashboard; do
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
done
echo "Polaris auto-start removed. (Any running instance has been stopped.)"
