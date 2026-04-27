#!/usr/bin/env bash
# write-exec-log.sh — atomically append one structured line to <vault>/00 - Dashboard/ExecLog.md
# The only reason this is a shell script: flock-based atomic append under concurrent writes.
# Everything else the runtime does is agent-native (Read/Write/Edit/Glob/Grep/Bash).
#
# See: vault/08 - System/Operations/_tools.md §1.1
# Spec: vault/08 - System/ONYX Master Directive.md §7 (ExecLog format)

set -euo pipefail

usage() {
  cat >&2 <<EOF
write-exec-log.sh — atomic append to ExecLog.md

Usage:
  $0 --vault <path> --status <STATUS> --duration-sec <int> \\
     [--project <id>] [--phase <id>] [--summary "..."]

Args:
  --vault <path>        vault root (required)
  --status <STATUS>     one of: COMPLETED, BLOCKED, INTEGRITY_ERROR, ABANDONED,
                        CONTINUING, IDLE, HEAL, ACQUIRE, RELEASE, ATOMISE,
                        BLOCKED_NOTIFY, PLAN, INIT, CONSOLIDATE, REPLAN
  --duration-sec <int>  integer seconds elapsed (0 allowed)
  --project <id>        optional — defaults to "-"
  --phase <id>          optional — defaults to "-"
  --summary "..."       optional — short free-text

Output format (appended to <vault>/00 - Dashboard/ExecLog.md):
  <ISO-UTC> | <project> | <phase> | <STATUS> | <duration> | <summary>

Exit codes:
  0  appended
  2  vault path invalid
  3  invalid args or required arg missing
  4  lock acquisition failed after timeout
EOF
  exit "${1:-3}"
}

# Defaults
VAULT=""
STATUS=""
DURATION=""
PROJECT="-"
PHASE="-"
SUMMARY=""
LOCK_TIMEOUT=10  # seconds

# Parse args
while [ $# -gt 0 ]; do
  case "$1" in
    --vault)        VAULT="$2"; shift 2 ;;
    --status)       STATUS="$2"; shift 2 ;;
    --duration-sec) DURATION="$2"; shift 2 ;;
    --project)      PROJECT="${2:--}"; shift 2 ;;
    --phase)        PHASE="${2:--}"; shift 2 ;;
    --summary)      SUMMARY="$2"; shift 2 ;;
    -h|--help)      usage 0 ;;
    *)              echo "unknown arg: $1" >&2; usage 3 ;;
  esac
done

# Validate required args
[ -z "$VAULT" ]    && { echo "--vault is required" >&2; usage 3; }
[ -z "$STATUS" ]   && { echo "--status is required" >&2; usage 3; }
[ -z "$DURATION" ] && { echo "--duration-sec is required" >&2; usage 3; }

# Validate vault
[ ! -d "$VAULT" ] && { echo "vault path does not exist or not a directory: $VAULT" >&2; exit 2; }

# Validate status against allowlist
case "$STATUS" in
  COMPLETED|BLOCKED|INTEGRITY_ERROR|ABANDONED|CONTINUING|IDLE|HEAL|ACQUIRE|RELEASE|ATOMISE|BLOCKED_NOTIFY|PLAN|INIT|CONSOLIDATE|REPLAN) ;;
  *) echo "invalid --status: $STATUS" >&2; usage 3 ;;
esac

# Validate duration is a non-negative integer
case "$DURATION" in
  ''|*[!0-9]*) echo "--duration-sec must be a non-negative integer: $DURATION" >&2; usage 3 ;;
esac

# Strip pipe chars from summary to keep format parseable
SUMMARY="${SUMMARY//|/∣}"

LOGFILE="$VAULT/00 - Dashboard/ExecLog.md"
LOGDIR="$(dirname "$LOGFILE")"

# Ensure parent dir exists (ExecLog always lives under 00 - Dashboard/)
mkdir -p "$LOGDIR"

ISO_NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LINE="${ISO_NOW} | ${PROJECT} | ${PHASE} | ${STATUS} | ${DURATION} | ${SUMMARY}"

# Atomic append via flock
{
  # Open fd 9 for append; flock holds an exclusive lock on it
  exec 9>>"$LOGFILE"
  if ! flock -x -w "$LOCK_TIMEOUT" 9; then
    echo "flock timeout after ${LOCK_TIMEOUT}s on: $LOGFILE" >&2
    exit 4
  fi
  printf '%s\n' "$LINE" >&9
  # flock is released when fd 9 closes
} 9>>"$LOGFILE"

exit 0
