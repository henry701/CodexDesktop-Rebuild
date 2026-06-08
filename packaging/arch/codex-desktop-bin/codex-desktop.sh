#!/bin/sh
# Electron 38+ defaults to native Wayland on Wayland sessions; that regresses
# Codex sidebar repaint on KDE. XWayland + no GPU compositing is stable.
args="--no-sandbox --disable-gpu-compositing"

# CODEX_OZONE_PLATFORM overrides the default platform choice.
# Set to "wayland" to test native Wayland, "x11" to force XWayland,
# or "auto" to let Electron decide (Electron 38+ prefers Wayland on Wayland sessions).
# Unset/empty = force X11 on Wayland (stable for KDE sidebar repaint).
ozone="${CODEX_OZONE_PLATFORM:-}"
if [ -z "$ozone" ]; then
  if [ "${XDG_SESSION_TYPE:-}" = wayland ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
    ozone=x11
  fi
fi
[ -n "$ozone" ] && args="$args --ozone-platform=$ozone"

exec /usr/lib/codex-desktop/Codex $args "$@"
