#!/bin/sh
# Electron 38+ defaults to native Wayland on Wayland sessions; that regresses
# Codex sidebar repaint on KDE. XWayland + no GPU compositing is stable.
args="--no-sandbox --disable-gpu-compositing"

if [ "${XDG_SESSION_TYPE:-}" = wayland ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
  args="$args --ozone-platform=x11"
fi

exec /usr/lib/codex-desktop/Codex $args "$@"
