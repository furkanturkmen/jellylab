#!/usr/bin/env bash
#
# Build and install on a connected iPhone, from wherever you happen to be.
#
# The problem this solves: code signing needs the login keychain, and the login
# keychain belongs to the graphical session. Run `expo run:ios` over ssh - from
# Windows, from another room, from the metro console - and it builds happily
# for several minutes and then dies at the signing step:
#
#     JellyLab.debug.dylib: errSecInternalComponent
#     xcodebuild exited with error code 65
#
# Nothing is wrong with the code when that happens, and the message says
# nothing about keychains, so it has cost more than one evening.
#
# So: if this is running over ssh, it does not build. It asks the Mac's own
# Terminal to build, in the session that can sign, and tees the output to a
# file so the ssh side can watch.
set -euo pipefail

REPO="${REPO:-$HOME/Documents/Personal/jellylab}"
LOG="${LOG:-$HOME/jellylab-device-build.log}"
DEVICE="${DEVICE:-}"

# Find the phone, because the picker cannot be used from here.
#
# Piping to tee costs the CLI its terminal, and without a terminal it refuses
# to prompt - "Input is required, but 'npx expo' is in non-interactive mode.
# Required input: Select a device". So the device is named up front, or the
# build runs without the log and asks in the window it opened.
if [ -z "$DEVICE" ]; then
  DEVICE=$(xcrun xctrace list devices 2>/dev/null |
    sed -n '/^== Devices ==/,/^== Simulators ==/p' |
    grep -viE 'macbook|mac mini|imac|== ' |
    grep -oE '\(([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}|[0-9A-Fa-f]{40})\)' |
    head -1 | tr -d '()')
fi

build_cmd="cd '$REPO' && caffeinate -s npx expo run:ios --device"
if [ -n "$DEVICE" ]; then
  echo "device: $DEVICE"
  build_cmd="$build_cmd $DEVICE --no-bundler 2>&1 | tee '$LOG'"
else
  # No device found: let it ask, and do not tee, or it cannot.
  echo "no device found - the build will ask in the window it opens"
  build_cmd="$build_cmd --no-bundler"
fi

# Ask the keychain directly rather than guessing from the environment.
#
# SSH_CONNECTION is not enough: a shell can reach this script through a relay,
# a tmux session or another shell's environment and still be unable to sign.
# The question is only ever "can this session use the signing key", and the
# keychain answers it - "User interaction is not allowed" is exactly the state
# that makes codesign fail later with errSecInternalComponent.
can_sign() {
  security show-keychain-info "$HOME/Library/Keychains/login.keychain-db" 2>&1 |
    grep -qv 'User interaction is not allowed'
}

if [ -n "${SSH_CONNECTION:-}" ] || ! can_sign; then
  echo "this session cannot sign - handing the build to the Mac's own Terminal"
  osascript -e "tell application \"Terminal\" to do script \"$build_cmd\"" >/dev/null
  # Empty it first: tail shows what is already there, and what is already
  # there is the last build - which is how a fresh run appeared to fail with
  # the previous run's error before it had compiled anything.
  : > "$LOG"
  echo "watching $LOG - ctrl-c stops watching, not the build"
  # -F rather than -f: the build recreates the file.
  exec tail -n 5 -F "$LOG"
fi

eval "$build_cmd"
