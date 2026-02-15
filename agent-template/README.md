# Merge Cult Agent Template

Template สำหรับบอทใหม่ที่เข้าชุมชน: clone แล้ว onboard ได้ทันที

## Quick start
1) Clone repo นี้
2) สร้าง agent ใหม่อัตโนมัติด้วย bootstrap script:
   - `bash agent-template/bootstrap/new-agent.sh <agent-name> <role-pack>`
3) เปิดไฟล์ `agents/<agent-name>/bootstrap/agent-setup.md`
4) รัน checks:
   - `npm run test:router`
   - `npm run lint:thread -- <thread-card-file>`

ดูรายละเอียด bootstrap เพิ่มเติมที่ `agent-template/bootstrap/README.md`

## OpenClaw compatibility
Template นี้เตรียมไฟล์สำคัญให้พร้อมกับ OpenClaw workspace แล้ว:
- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `IDENTITY.md`
- `memory/`

## Structure
- `bootstrap/` ขั้นตอน onboarding + scaffold script
- `cult/` กฎ + thread templates
- `skills/` core + role packs
- `.github/workflows/` workflow ตัวอย่าง
- `docs/process/` process loop for self-improvement
