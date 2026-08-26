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

# Try to sign something, because that is the question.
#
# Asking the keychain about itself does not work - `show-keychain-info` needs
# interaction by design and fails identically in both sessions. Signing a
# throwaway copy of /usr/bin/true takes a moment and gives the real answer:
# either codesign can use the key from here, or it returns the same
# errSecInternalComponent that would otherwise appear ten minutes into a build.
can_sign() {
  local identity probe
  identity=$(security find-identity -v -p codesigning 2>/dev/null |
    grep -m1 'Apple Development' | awk '{ print $2 }')
  [ -n "$identity" ] || return 1

  probe=$(mktemp -d)
  cp /usr/bin/true "$probe/probe"
  local ok=1
  codesign --force --sign "$identity" "$probe/probe" >/dev/null 2>&1 && ok=0
  rm -rf "$probe"
  return $ok
}

if ! can_sign; then
  # Hand the build to the graphical session, but keep it interactive.
  #
  # A plain handoff runs the build in a window you cannot see and tails a log
  # back, so a prompt from the CLI is invisible and unanswerable. Instead the
  # Mac's own Terminal starts a tmux session - which inherits the session that
  # can sign - and this side attaches to it. Same terminal, both ends: the
  # build prompts, you answer, ctrl-c reaches it.
  SESSION="${SESSION:-jellylab-build}"

  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "starting the build in the Mac's session, as tmux '$SESSION'"
    osascript -e "tell application \"Terminal\" to do script \"tmux new-session -A -s $SESSION '$build_cmd; echo; echo [build finished - press enter to close]; read'\"" >/dev/null
    # The socket appears a moment after Terminal opens.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      tmux has-session -t "$SESSION" 2>/dev/null && break
      sleep 1
    done
  else
    echo "attaching to the build already running as tmux '$SESSION'"
  fi

  echo "attaching - ctrl-b d detaches and leaves it building"
  exec tmux attach -t "$SESSION"
fi

eval "$build_cmd"
