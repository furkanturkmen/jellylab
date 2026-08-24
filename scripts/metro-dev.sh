#!/usr/bin/env bash
#
# Runs Metro on the Mac, ships its output to the homelab, and relays keystrokes
# back from there.
#
# Both directions are opened *outbound* from the Mac, because that laptop is
# employer-managed: nothing listens on it and nothing is installed beyond tmux.
#
# Expo turns its interactive key handling off unless BOTH stdin and stdout are a
# TTY. An earlier version piped stdout into `tee` to capture the log, which
# silently disabled r/j/m - the giveaway being that Expo never printed its
# "Press ? | show all commands" banner. So Expo owns the terminal completely and
# the output is captured with `tmux pipe-pane`, which copies what the pane
# displays without touching the process's own stdio.
#
# Settings come from the environment, or from ~/.metro-dev.env if it exists, so
# this file can live in the repo without carrying anyone's addresses:
#
#     REPO=~/Documents/Personal/jellylab
#     HOMELAB=192.168.1.10
#     SSH_USER=you
#     PORT=8081

set -uo pipefail

[ -f "$HOME/.metro-dev.env" ] && . "$HOME/.metro-dev.env"

REPO="${REPO:-$HOME/Documents/Personal/jellylab}"
HOMELAB="${HOMELAB:-homelab.local}"
SSH_USER="${SSH_USER:-$USER}"
USER_AT="$SSH_USER@$HOMELAB"
SESSION=metro
RAW="$HOME/.metro-raw.log"

# Pinned, not left to Expo.
#
# Expo takes 8081 if it is free and quietly moves to 8082 if it is not, so a
# stray bundler from an earlier run - or the one `expo run:ios` starts for
# itself - ends up owning the port the dev client is built against. The console
# then drives the *other* Metro: pressing r prints "Reloading apps" and the
# phone never moves, which reads as the relay being broken.
PORT="${PORT:-8081}"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required (macOS ships a 2003-era screen that cannot log to a chosen file)." >&2
  echo "install it with:  brew install tmux" >&2
  exit 1
fi

port_owner() {
  lsof -ti "tcp:$PORT" 2>/dev/null | head -1
}

case "${1:-start}" in
  start)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "session '$SESSION' already running - stop it first with: $0 stop" >&2
      exit 1
    fi

    owner="$(port_owner)"
    if [ -n "$owner" ]; then
      cmd="$(ps -p "$owner" -o command= 2>/dev/null)"
      case "$cmd" in
        *expo*|*metro*)
          echo "port $PORT held by a stray bundler (pid $owner) - killing it"
          kill "$owner" 2>/dev/null
          sleep 1
          ;;
        *)
          # Anything else is not ours to kill, and starting anyway would put
          # Metro on a port nothing is looking for.
          echo "port $PORT is in use by pid $owner:" >&2
          echo "  $cmd" >&2
          echo "free it, or run with PORT=<other> - but the dev client must be built against that port too." >&2
          exit 1
          ;;
      esac
    fi

    : > "$RAW"
    tmux new-session -d -s "$SESSION" -x 200 -y 50 "cd '$REPO' && exec npx expo start --port $PORT"
    # -o appends; the pane's output is copied, Expo's own stdio is untouched
    tmux pipe-pane -t "$SESSION" -o "cat >> '$RAW'"

    # ship the captured pane to the homelab
    ( while :; do
        tail -n +1 -F "$RAW" 2>/dev/null | ssh -o ServerAliveInterval=30 "$USER_AT" 'cat > ~/jellylab-metro.log'
        sleep 3
      done ) >/dev/null 2>&1 &
    echo $! > /tmp/metro-ship.pid

    # relay keys back. -n0 so a backlog is not replayed on reconnect.
    ( while :; do
        ssh -o ServerAliveInterval=30 "$USER_AT" 'tail -n0 -F ~/metro-cmd' 2>/dev/null |
          while IFS= read -r key; do
            [ -n "$key" ] && tmux send-keys -t "$SESSION" "$key"
          done
        sleep 3
      done ) >/dev/null 2>&1 &
    echo $! > /tmp/metro-relay.pid

    echo "metro running under tmux session '$SESSION' on port $PORT"
    echo "  watch here     : tmux attach -t $SESSION   (detach with ctrl-b then d)"
    echo "  logs elsewhere : ssh $USER_AT 'tail -F ~/jellylab-metro.log'"
    echo "  send a key     : ssh $USER_AT 'echo r >> ~/metro-cmd'"
    ;;

  status)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "tmux session : running"
    else
      echo "tmux session : not running"
    fi
    echo -n "port $PORT     : "
    curl -s -m 3 "http://127.0.0.1:$PORT/status" || echo "nothing answering"
    echo
    # More than one is the failure this script exists to prevent.
    others="$(lsof -ti tcp:8081 -ti tcp:8082 -ti tcp:8083 2>/dev/null | sort -u | wc -l | tr -d ' ')"
    echo "bundler ports in use (8081-8083): $others"
    ;;

  stop)
    for f in /tmp/metro-ship.pid /tmp/metro-relay.pid; do
      [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null
      rm -f "$f"
    done
    tmux kill-session -t "$SESSION" 2>/dev/null
    # the loops above are subshells; their ssh children outlive a kill on the
    # parent, and a stale relay double-sends every keystroke once a new one
    # starts. Match the ssh commands themselves.
    pkill -f "ssh.*tail -n0 -F ~/metro-cmd" 2>/dev/null
    pkill -f "ssh.*cat > ~/jellylab-metro.log" 2>/dev/null
    pkill -f "npx expo start" 2>/dev/null
    pkill -f "expo/bin/cli" 2>/dev/null
    echo "stopped"
    ;;

  *)
    echo "usage: $0 [start|status|stop]" >&2; exit 1;;
esac
