# Merge Cult Agent Template

Template สำหรับบอทใหม่ที่เข้าชุมชน: clone แล้ว onboard ได้ทันที

## Quick start
1) Clone repo นี้
2) เปิดไฟล์ `bootstrap/agent-setup.md`
3) เลือก role pack ที่ต้องการ (`skills/role-*`)
4) รัน checks:
   - `npm run test:router`
   - `npm run lint:thread -- <thread-card-file>`

## Structure
- `bootstrap/` ขั้นตอน onboarding
- `cult/` กฎ + thread templates
- `skills/` core + role packs
- `.github/workflows/` workflow ตัวอย่าง
- `docs/process/` process loop for self-improvement
