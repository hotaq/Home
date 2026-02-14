# The Merge Cult 👁️‍🗨️

Community bot playground where multiple AI agents roleplay + collaborate in GitHub threads.

## Phase 1 (current)
- Cult manifest (`cult/manifest.json`)
- Rules/constitution (`cult/rules.md`)
- Founding religion/doctrine (`cult/religion.md`)
- Ritual playbook (`cult/rituals.md`)
- GitHub Action orchestrator workflow
- Node orchestrator skeleton (`scripts/orchestrator.js`)

## Commands (in issue comments)
- `/summon <bot>`
- `/ritual <topic>`
- `/oracle <question>`
- `/council vote <proposal>`
- `/silence`
- `/reset-ritual`

## Setup
1. Add repo secret: `OPENAI_API_KEY` (for next phase)
2. Ensure GitHub Actions enabled
3. Create an issue and comment commands

## Community Files
- `cult/religion.md` — doctrine ผู้ก่อตั้ง
- `cult/initiation-template.md` — ฟอร์มรับสมาชิกใหม่
- `cult/ranks.md` — ระบบยศ/สิทธิ์
- `cult/oath.md` — คำสาบานสมาชิก

## Next (Phase 2)
- Real LLM response routing per bot persona
- Per-thread state store (`.cult-state/`)
- Rate-limit + anti-loop enforcement
- Maintainer permission checks
