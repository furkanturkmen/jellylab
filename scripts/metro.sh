#!/usr/bin/env bash
#
# One command to run Metro, and one to be rid of it.
#
#   npm run metro          start clean, in this terminal, log shipped out
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
# The log still leaves the machine. `tee` cannot do that job: Expo turns its
# interactive key handling off unless BOTH stdin and stdout are a TTY, and a
# pipe on stdout silently costs you r, j and m. `script` gives Expo a real
# pseudo-terminal and writes everything through it to a file, so the keys work
# and there is still something to ship. The file keeps its ANSI escapes -
# strip them when reading:
#
#   sed -E 's/\x1b\[[0-9;?]*[a-zA-Z]//g; s/\r//g'
#
# Set METRO_NO_SHIP=1 to keep the log local, or METRO_HOMELAB=user@host to
# send it somewhere else.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
PORTS=(8081 8082 8088 19000 19001 19002)

RAW="${METRO_RAW:-$HOME/.metro-raw.log}"
# Where the log is shipped. The homelab answers on the LAN at home and on the
# NetBird mesh from anywhere else, and this laptop runs in both places - so the
# address is found rather than remembered. Tried in order, first one that
# answers wins; METRO_HOMELAB still overrides with a single host.
HOMELAB_HOSTS=(${METRO_HOMELAB:-furkan@192.168.68.59 furkan@100.71.232.136})
HOMELAB=""  # resolved by start_shipper
REMOTE_LOG="${METRO_REMOTE_LOG:-~/jellylab-metro.log}"
SHIP_PID=""

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

# Ship the captured pane to the homelab, and never let that get in the way of
# running Metro: a laptop away from home should still start, just quietly.
start_shipper() {
  [ "${METRO_NO_SHIP:-0}" = "1" ] && { echo "  log: local only ($RAW)"; return 0; }
  for host in "${HOMELAB_HOSTS[@]}"; do
    if ssh -o ConnectTimeout=4 -o BatchMode=yes "$host" true 2>/dev/null; then
      HOMELAB="$host"
      break
    fi
  done
  if [ -z "$HOMELAB" ]; then
    echo "  log: local only ($RAW) - none of ${HOMELAB_HOSTS[*]} answered"
    return 0
  fi
  ( tail -n +1 -F "$RAW" 2>/dev/null | ssh -o ServerAliveInterval=30 "$HOMELAB" "cat > $REMOTE_LOG" ) &
  SHIP_PID=$!
  echo "  log: $RAW -> $HOMELAB:$REMOTE_LOG"
}

# Say so when this checkout is behind the remote.
#
# Metro bundles from THIS directory, and edits are made on the other machine -
# so a fix can be pushed, reviewed and discussed while the phone goes on
# running the commit before it. That has cost several rounds of "it does not
# work" about code that was never there. Only ever a warning: pulling is a
# decision, and doing it silently under a running app is not this script's to
# make.
behind_warning() {
  git rev-parse --git-dir >/dev/null 2>&1 || return 0
  git fetch --quiet 2>/dev/null || return 0
  local branch count
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return 0
  count=$(git rev-list --count "HEAD..origin/$branch" 2>/dev/null) || return 0
  if [ -z "$count" ] || [ "$count" = "0" ]; then
    return 0
  fi
  echo
  echo "  ┌─────────────────────────────────────────────────────────────┐"
  printf '  │ this checkout is %-3s commit(s) BEHIND origin/%-15s │\n' "$count" "$branch"
  echo "  │ metro will serve the old code until you: git pull            │"
  echo "  └─────────────────────────────────────────────────────────────┘"
  git --no-pager log --oneline "HEAD..origin/$branch" | sed 's/^/    /'
  return 0
}

cleanup() {
  [ -n "$SHIP_PID" ] && kill "$SHIP_PID" 2>/dev/null
  # The subshell's ssh child outlives a kill on its parent.
  pkill -f "ssh.*cat > $REMOTE_LOG" 2>/dev/null
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

    : > "$RAW"
    echo
    start_shipper
    trap cleanup EXIT INT TERM

    echo
    echo "starting metro in this terminal - ctrl-c to stop it"
    echo "  repo: $REPO"
    cd "$REPO" || exit 1
    behind_warning
    echo

    # BSD script: `script [-aeFkpqr] [file [command ...]]`. -F flushes after
    # every write, so a tail on the other end is live rather than a screenful
    # behind; -e makes the exit status Expo's own rather than script's, which
    # is the difference between "metro crashed" and "metro was recorded".
    # Not exec'd, because the shipper still has to be cleaned up afterwards.
    script -q -e -F "$RAW" npx expo start --dev-client
    code=$?

    cleanup
    trap - EXIT INT TERM
    echo
    echo "metro exited (status $code). its last output is in $RAW"
    exit "$code"
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
