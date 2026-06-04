#!/bin/sh
export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-auto}"
exec /usr/lib/codex-desktop/Codex --no-sandbox "$@"
