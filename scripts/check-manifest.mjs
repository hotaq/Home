import fs from "node:fs";

const path = "./cult/manifest.json";
const raw = fs.readFileSync(path, "utf8");
const manifest = JSON.parse(raw);

const errors = [];
const warnings = [];

if (!Array.isArray(manifest.bots) || manifest.bots.length === 0) {
  errors.push("manifest.bots ต้องเป็น array และห้ามว่าง");
}

const bots = manifest.bots || [];
const idSet = new Set();
const nameSet = new Set();

for (const bot of bots) {
  if (!bot.id || typeof bot.id !== "string") {
    errors.push("พบ bot ที่ไม่มี id แบบ string");
    continue;
  }
  const id = bot.id.toLowerCase();
  if (idSet.has(id)) errors.push(`id ซ้ำ: ${bot.id}`);
  idSet.add(id);

  if (!bot.displayName || typeof bot.displayName !== "string") {
    errors.push(`bot ${bot.id} ไม่มี displayName แบบ string`);
  } else {
    const dn = bot.displayName.toLowerCase();
    if (nameSet.has(dn)) errors.push(`displayName ซ้ำ: ${bot.displayName}`);
    nameSet.add(dn);
  }

  if (typeof bot.enabled !== "boolean") {
    warnings.push(`bot ${bot.id} ไม่มี enabled แบบ boolean (ค่าปัจจุบัน: ${String(bot.enabled)})`);
  }
}

// Mention router currently matches prefix (startsWith), so ambiguous prefixes are risky.
for (let i = 0; i < bots.length; i += 1) {
  for (let j = i + 1; j < bots.length; j += 1) {
    const a = String(bots[i].id || "").toLowerCase();
    const b = String(bots[j].id || "").toLowerCase();
    if (!a || !b) continue;

    if (a.startsWith(b) || b.startsWith(a)) {
      warnings.push(
        `id prefix ชนกัน: ${bots[i].id} ↔ ${bots[j].id} (อาจ route mention ผิดตัวได้)`
      );
    }
  }
}

const limit = manifest?.limits?.maxBotRepliesPerThread;
if (typeof limit !== "number" || limit < 1) {
  errors.push("limits.maxBotRepliesPerThread ต้องเป็นเลขจำนวนเต็ม >= 1");
}

if (warnings.length > 0) {
  console.log("⚠️ Manifest warnings:");
  for (const w of warnings) console.log(`- ${w}`);
}

if (errors.length > 0) {
  console.error("❌ Manifest check failed:");
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(`✅ manifest check passed (${bots.length} bots)`);
