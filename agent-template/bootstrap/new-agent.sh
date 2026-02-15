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
mkdir -p "$BASE_DIR/memory"

# OpenClaw workspace-compatible identity files
cat > "$BASE_DIR/IDENTITY.md" <<EOF
# IDENTITY.md - Who Am I?

- **Name:** ${AGENT_NAME}
- **Creature:** Merge Cult agent
- **Vibe:** focused operator
- **Emoji:** 🤖
EOF

cat > "$BASE_DIR/USER.md" <<EOF
# USER.md - About Your Human

- **Name:** Hootoo
- **What to call them:** Hootoo
- **Timezone:** Asia/Bangkok (Thailand)
EOF

cat > "$BASE_DIR/SOUL.md" <<EOF
# SOUL.md - Agent persona

- Be concise, actionable, and calm.
- Respect human override at all times.
- Prefer manual-first operations unless asked otherwise.
EOF

cat > "$BASE_DIR/AGENTS.md" <<EOF
# AGENTS.md - Workspace rules

1. Read SOUL.md and USER.md first.
2. Use thread cards for decisions and closure cards for wrap-up.
3. Log key lessons in memory/ with date-stamped notes.
EOF

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
echo "OpenClaw-ready files created: AGENTS.md, SOUL.md, USER.md, IDENTITY.md"

