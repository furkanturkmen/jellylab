#!/usr/bin/env bash
#
# One interactive console for Metro, which runs on the MacBook under tmux.
#
# All of this used to live in a PowerShell script on the Windows PC and never
# worked: PowerShell 5.1 runs Register-ObjectEvent actions on the main runspace
# when it is idle, so an output handler and a blocking ReadKey cannot both own
# the console, and every keypress was swallowed silently. Doing it here instead
# means ssh -t supplies a real TTY and bash reads keys directly - Windows runs
# nothing but an ssh client.
#
#   logs : this tails the file the Mac ships its tmux pane into
#   keys : each keypress is appended to ~/metro-cmd, which the Mac follows
#          and replays into the tmux session

LOG="$HOME/jellylab-metro.log"
CMD="$HOME/metro-cmd"

printf '\033[36m  JellyLab - Metro\033[0m\n'
printf '\033[90m  r reload    j debugger    m dev menu    ? all commands    Esc quit\033[0m\n'
printf '\033[90m  %s\033[0m\n\n' "----------------------------------------------------------------------"

touch "$LOG" "$CMD"
tail -n 40 -F "$LOG" &
TAIL=$!
# restore the terminal and stop the tail however this exits
trap 'kill "$TAIL" 2>/dev/null; stty sane 2>/dev/null; printf "\n\033[90m  closed\033[0m\n"' EXIT

# -s so the key is not echoed, -n1 for a single character, -r so backslashes
# are literal. Esc quits.
while IFS= read -rsn1 key; do
  [ "$key" = $'\e' ] && break
  [ -z "$key" ] && continue
  # Metro's keys are lower case and it ignores anything else in silence, so a
  # capital R - shift held, or caps lock on - looked exactly like a console
  # that had stopped listening.
  case "$key" in
    [A-Z]) key=$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]') ;;
  esac
  printf '%s\n' "$key" >> "$CMD"
  printf '\033[36m  [%s] sent\033[0m\n' "$key"
done
