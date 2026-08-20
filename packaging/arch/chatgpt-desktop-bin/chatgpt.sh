#!/bin/sh
# Official Linux ChatGPT defaults to XWayland in a Wayland session.
# Native Wayland: CHATGPT_OZONE_PLATFORM=wayland (or CODEX_OZONE_PLATFORM).
# GPU compositing is OFF by default (--disable-gpu-compositing); opt out: CHATGPT_DISABLE_GPU=0

args="--no-sandbox"

gpu="${CHATGPT_DISABLE_GPU:-${CODEX_DISABLE_GPU:-compositing}}"
case "$gpu" in
  0|off|false) ;;
  full) args="$args --disable-gpu" ;;
  *) args="$args --disable-gpu-compositing" ;;
esac

ozone="${CHATGPT_OZONE_PLATFORM:-${CODEX_OZONE_PLATFORM:-}}"
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

exec /usr/lib/chatgpt/ChatGPT $args "$@"
