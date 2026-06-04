#!/bin/sh
# Electron 38+ removed ELECTRON_OZONE_PLATFORM_HINT; pass --ozone-platform instead.
# Default: x11 (XWayland on Wayland sessions). Override:
#   CODEX_OZONE_PLATFORM=wayland|x11|auto codex-desktop
# Legacy alias (wrapper-only, Electron no longer reads it):
#   ELECTRON_OZONE_PLATFORM_HINT=wayland codex-desktop

ozone="${CODEX_OZONE_PLATFORM:-x11}"
if [ -n "${ELECTRON_OZONE_PLATFORM_HINT:-}" ]; then
  ozone="$ELECTRON_OZONE_PLATFORM_HINT"
fi

exec /usr/lib/codex-desktop/Codex --no-sandbox --ozone-platform="$ozone" "$@"
