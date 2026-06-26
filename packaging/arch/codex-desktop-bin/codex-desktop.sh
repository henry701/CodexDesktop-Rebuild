#!/bin/sh
# KDE on Wayland: default XWayland (fb601df — stable sidebar repaint). Native Wayland via override.
# Pin app 26.602.x: 26.623+ pet overlay breaks keyboard on native Wayland.
# GPU compositing is OFF by default (--disable-gpu-compositing); opt out: CODEX_DISABLE_GPU=0
#
# CODEX_OZONE_PLATFORM=wayland|x11|auto

args="--no-sandbox"

case "${CODEX_DISABLE_GPU:-compositing}" in
  0|off|false) ;;
  full) args="$args --disable-gpu" ;;
  *) args="$args --disable-gpu-compositing" ;;
esac

ozone="${CODEX_OZONE_PLATFORM:-}"
if [ -z "$ozone" ]; then
  if [ "${XDG_SESSION_TYPE:-}" = wayland ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
    ozone=x11
  fi
elif [ "$ozone" = auto ]; then
  ozone=
fi

if [ "$ozone" = wayland ]; then
  args="$args --ozone-platform=wayland"
  args="$args --enable-features=UseOzonePlatform,GlobalShortcutsPortal,CustomTitlebar"
  args="$args --enable-wayland-ime --wayland-text-input-version=3"
elif [ -n "$ozone" ]; then
  args="$args --ozone-platform=$ozone"
fi

exec /usr/lib/codex-desktop/Codex $args "$@"
