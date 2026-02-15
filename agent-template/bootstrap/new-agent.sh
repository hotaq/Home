#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <agent-name> <role-pack: nanta|arachia|shoji>"
  exit 1
fi

AGENT_NAME="$1"
ROLE_PACK="$2"
BASE_DIR="agents/${AGENT_NAME}"

case "$ROLE_PACK" in
  nanta|arachia|shoji) ;;
  *)
    echo "Invalid role-pack: $ROLE_PACK (use nanta|arachia|shoji)"
    exit 1
    ;;
esac

mkdir -p "$BASE_DIR/skills"
mkdir -p "$BASE_DIR/cult"
mkdir -p "$BASE_DIR/docs/process"
mkdir -p "$BASE_DIR/bootstrap"

cp -r agent-template/skills/core-operating-rules "$BASE_DIR/skills/"
cp -r "agent-template/skills/role-${ROLE_PACK}" "$BASE_DIR/skills/"
cp agent-template/cult/thread-cards-template.md "$BASE_DIR/cult/"
cp agent-template/bootstrap/agent-setup.md "$BASE_DIR/bootstrap/"

cat > "$BASE_DIR/README.md" <<EOF
# Agent: ${AGENT_NAME}

Generated from agent-template.

## Role pack
- role-${ROLE_PACK}

## Next steps
1. Fill identity + timezone in bootstrap/agent-setup.md
2. Run checks from repo root:
   - npm run test:router
   - npm run lint:thread -- <thread-card-file>
3. Open first thread using cult/thread-cards-template.md
EOF

echo "✅ Agent scaffold created at: $BASE_DIR"
echo "Next: open $BASE_DIR/bootstrap/agent-setup.md"
