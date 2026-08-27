#!/usr/bin/env bash
#
# One command to run Metro, and one to be rid of it.
#
#   npm run metro          start clean, in this terminal
#   npm run metro:stop     kill everything, on every port
#   npm run metro:status   what is actually running
#
# Metro runs in the FOREGROUND, on purpose. It was run detached inside tmux so
# its log could be shipped elsewhere, and when `expo start` exited the session
# went with it - taking the error that explained why. What was left was a
# keystroke relay forwarding r into a session that no longer existed, which
# reads exactly like a Metro that has stopped responding rather than one that
# is gone. Here, if it dies, it dies in front of you.
#
# Nothing is piped either. Expo turns its interactive key handling off unless
# both stdin and stdout are a TTY, so a `tee` for logging silently costs you
# r, j and m - see metro-dev.sh, which exists for when the log genuinely has
# to leave the machine and uses tmux pipe-pane to get it.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
PORTS=(8081 8082 8088 19000 19001 19002)

status() {
  local found=0
  for port in "${PORTS[@]}"; do
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null)
    if [ -n "$pids" ]; then
      found=1
      for pid in $pids; do
        printf '  port %-5s pid %-7s %s\n' "$port" "$pid" \
          "$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-70)"
      done
    fi
  done

  # The leftovers that outlive a dead session: the log shipper and the
  # keystroke relay from metro-dev.sh, and the tmux server itself.
  local strays
  strays=$(pgrep -fl "ssh.*metro-cmd|ssh.*jellylab-metro.log" 2>/dev/null | cut -c1-70)
  [ -n "$strays" ] && { found=1; echo "  strays:"; echo "$strays" | sed 's/^/    /'; }
  tmux has-session -t metro 2>/dev/null && { found=1; echo "  tmux session 'metro' is up"; }

  [ "$found" = "0" ] && echo "  nothing running"
  return 0
}

case "${1:-start}" in
  start)
    # Always from a clean slate. Half the "Metro is not responding" cases are a
    # dead session with a live listener still holding 8081, and starting on top
    # of that gets you the port-in-use prompt buried inside something you
    # cannot see.
    echo "clearing anything already running..."
    bash "$HERE/metro-stop.sh" | sed 's/^/  /'

    echo
    echo "starting metro in this terminal - ctrl-c to stop it"
    echo "  repo: $REPO"
    echo
    cd "$REPO" || exit 1
    # exec so ctrl-c reaches Expo itself rather than this wrapper, and so no
    # shell is left behind holding the port after Expo goes.
    exec npx expo start --dev-client
    ;;

  stop)
    bash "$HERE/metro-stop.sh"
    ;;

  status)
    echo "metro status:"
    status
    ;;

  *)
    echo "usage: $0 [start|stop|status]" >&2
    exit 1
    ;;
esac
