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

build_cmd="cd '$REPO' && caffeinate -s npx expo run:ios --device"
[ -n "$DEVICE" ] && build_cmd="$build_cmd $DEVICE"
build_cmd="$build_cmd --no-bundler 2>&1 | tee '$LOG'"

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
  echo "watching $LOG - ctrl-c stops watching, not the build"
  # -F rather than -f: the build recreates the file.
  exec tail -n 5 -F "$LOG"
fi

eval "$build_cmd"
