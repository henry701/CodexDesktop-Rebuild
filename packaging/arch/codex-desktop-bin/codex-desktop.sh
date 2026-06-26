#!/bin/sh
# On Wayland sessions, prefer native Wayland (matches Cursor and avoids KDE/XWayland
# drag/taskbar regressions on Electron 42+). XWayland remains available via override.
args="--no-sandbox --disable-gpu-compositing"

# CODEX_OZONE_PLATFORM overrides the default platform choice.
#   wayland — native Wayland (default on Wayland sessions)
#   x11     — force XWayland (legacy KDE sidebar repaint workaround)
#   auto    — omit --ozone-platform; let Electron decide
ozone="${CODEX_OZONE_PLATFORM:-}"
if [ -z "$ozone" ]; then
  if [ "${XDG_SESSION_TYPE:-}" = wayland ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
    ozone=wayland
  fi
elif [ "$ozone" = auto ]; then
  ozone=
fi
[ -n "$ozone" ] && args="$args --ozone-platform=$ozone"

exec /usr/lib/codex-desktop/Codex $args "$@"
