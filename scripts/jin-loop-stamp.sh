#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="${JIN_LOOP_STATE_FILE:-.state/jin-loop-last.json}"

usage() {
  cat <<'EOF'
Usage:
  scripts/jin-loop-stamp.sh show
  scripts/jin-loop-stamp.sh suggest <file1> [file2 ...]
  scripts/jin-loop-stamp.sh update --files <csv> [--commit <sha|none>] [--next <hint>]

Examples:
  scripts/jin-loop-stamp.sh show
  scripts/jin-loop-stamp.sh suggest docs/process/a.md docs/process/b.md
  scripts/jin-loop-stamp.sh update --files docs/process/a.md,scripts/x.sh --commit abc123 --next "touch docs/process/b.md"
EOF
}

ensure_state() {
  mkdir -p "$(dirname "$STATE_FILE")"
  if [[ ! -f "$STATE_FILE" ]]; then
    cat > "$STATE_FILE" <<'JSON'
{
  "lastRunAt": null,
  "lastTouchedFiles": [],
  "lastCommit": null,
  "nextHint": null
}
JSON
  fi
}

json_get() {
  local js="$1"
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));${js}" "$STATE_FILE"
}

cmd_show() {
  ensure_state
  cat "$STATE_FILE"
}

cmd_suggest() {
  ensure_state
  if [[ $# -lt 1 ]]; then
    echo "Need at least one candidate file" >&2
    exit 1
  fi

  local last_json
  last_json="$(json_get 'console.log(JSON.stringify(d.lastTouchedFiles||[]))')"

  node -e '
const last = new Set(JSON.parse(process.argv[1]));
const candidates = process.argv.slice(2);
const pick = candidates.find(c => !last.has(c)) || candidates[0] || null;
process.stdout.write((pick ?? "") + "\n");
' "$last_json" "$@"
}

cmd_update() {
  ensure_state
  local files_csv=""
  local commit=""
  local next_hint=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --files)
        files_csv="${2:-}"
        shift 2
        ;;
      --commit)
        commit="${2:-}"
        shift 2
        ;;
      --next)
        next_hint="${2:-}"
        shift 2
        ;;
      *)
        echo "Unknown option: $1" >&2
        usage
        exit 1
        ;;
    esac
  done

  if [[ -z "$files_csv" ]]; then
    echo "--files is required" >&2
    exit 1
  fi

  node -e '
const fs = require("fs");
const p = process.argv[1];
const filesCsv = process.argv[2];
const commit = process.argv[3];
const nextHint = process.argv[4];
const raw = fs.readFileSync(p, "utf8");
const d = JSON.parse(raw);
d.lastRunAt = new Date().toISOString();
d.lastTouchedFiles = filesCsv.split(",").map(s => s.trim()).filter(Boolean);
d.lastCommit = commit && commit !== "none" ? commit : null;
d.nextHint = nextHint || null;
fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
' "$STATE_FILE" "$files_csv" "$commit" "$next_hint"

  cat "$STATE_FILE"
}

main() {
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    show) cmd_show "$@" ;;
    suggest) cmd_suggest "$@" ;;
    update) cmd_update "$@" ;;
    -h|--help|help|"") usage ;;
    *)
      echo "Unknown command: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
