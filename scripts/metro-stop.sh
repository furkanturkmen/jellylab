#!/usr/bin/env bash
#
# Stop everything Metro, on any port, from anywhere.
#
# Killing the tmux session is not enough and looked like it was: metro-dev.sh
# and the two ssh pipes that carry the log out and the keystrokes back are
# separate processes, and they survive their session. What that leaves behind
# is a console on the Windows PC quietly appending keys to a file nobody reads,
# and a log that still holds the last thing Metro said - which reads exactly
# like a Metro that has stopped responding rather than one that is gone.
#
# Only Expo and Metro are matched. This laptop runs other people's dev servers
# and a broad `pkill node` would take them with it.

set -uo pipefail

PORTS=(8081 8082 8088 19000 19001 19002)
PATTERNS=(
  "expo start"
  "expo run"
  "@expo/cli"
  "react-native/cli"
  "metro"
  "metro-dev.sh"
  "ssh.*metro-cmd"
  "ssh.*jellylab-metro.log"
)

echo "stopping metro"

tmux kill-server 2>/dev/null && echo "  tmux server stopped"

for pattern in "${PATTERNS[@]}"; do
  if pkill -f "$pattern" 2>/dev/null; then
    echo "  killed: $pattern"
  fi
done

for port in "${PORTS[@]}"; do
  pids=$(lsof -ti:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null && echo "  freed port $port"
  fi
done

sleep 1

left=0
for port in "${PORTS[@]}"; do
  pid=$(lsof -ti:"$port" 2>/dev/null | head -1)
  [ -n "$pid" ] && { echo "  STILL on $port: $pid"; left=1; }
done
procs=$(pgrep -f "expo start|expo run|@expo/cli|react-native/cli|metro" 2>/dev/null | wc -l | tr -d ' ')
[ "$procs" != "0" ] && { echo "  STILL running: $procs process(es)"; left=1; }

if [ "$left" = "0" ]; then
  echo "  all clear - no metro, no expo, every port free"
fi
