#!/usr/bin/env node
import fs from "node:fs";

function parseArgs(argv) {
  const out = {
    file: "",
    text: "",
    maxLineChars: 180,
    requireBoard: "",
    requireLine1Path: false,
    requireNumbered: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i] ?? "";
    else if (a === "--text") out.text = argv[++i] ?? "";
    else if (a === "--max-line-chars") out.maxLineChars = Number(argv[++i] ?? "180");
    else if (a === "--require-board") out.requireBoard = String(argv[++i] ?? "").trim();
    else if (a === "--require-line1-path") out.requireLine1Path = true;
    else if (a === "--require-numbered") out.requireNumbered = true;
    else if (a === "-h" || a === "--help") {
      console.log(`Usage: node scripts/jin-loop-validate-th-report.mjs [--file <path> | --text <report>] [--max-line-chars <n>] [--require-board <id>] [--require-line1-path] [--require-numbered]\n\nValidate Thai 4-line loop report format.`);
      process.exit(0);
    }
  }

  return out;
}

function fail(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function readInput(opt) {
  if (opt.file) {
    try {
      return fs.readFileSync(opt.file, "utf8");
    } catch {
      fail(`อ่านไฟล์ไม่ได้: ${opt.file}`, 3);
    }
  }

  if (opt.text) return opt.text;

  fail("ต้องระบุ --file หรือ --text", 2);
}

const opt = parseArgs(process.argv);
if (!Number.isFinite(opt.maxLineChars) || opt.maxLineChars < 60) {
  fail("--max-line-chars ต้องเป็นตัวเลข >= 60", 4);
}

const raw = readInput(opt)
  .replace(/\r\n/g, "\n")
  .trim();

const lines = raw.split("\n").map((l) => l.trim());
if (lines.length !== 4) fail(`ต้องมี 4 บรรทัดพอดี (เจอ ${lines.length})`, 5);

const prefixes = ["เปลี่ยน:", "ช่วยได้:", "ถัดไป:", "หลักฐาน:"];
for (let i = 0; i < prefixes.length; i += 1) {
  const bare = lines[i];
  const numbered = bare.replace(/^\d+\)\s*/, "");
  if (!numbered.startsWith(prefixes[i])) {
    fail(`บรรทัด ${i + 1} ต้องขึ้นต้นด้วย '${prefixes[i]}' (ยอมรับรูปแบบ '1) ${prefixes[i]}' ด้วย)`, 6);
  }

  if (opt.requireNumbered && !new RegExp(`^${i + 1}\\)\\s+`).test(bare)) {
    fail(`บรรทัด ${i + 1} ต้องเป็นรูปแบบเลขลำดับ '${i + 1}) ...'`, 12);
  }
}

const tooLong = lines
  .map((line, idx) => ({ line: idx + 1, len: line.length }))
  .filter((x) => x.len > opt.maxLineChars);
if (tooLong.length > 0) {
  fail(
    `เกินความยาวสูงสุด ${opt.maxLineChars} chars: ${tooLong
      .map((x) => `L${x.line}=${x.len}`)
      .join(", ")}`,
    7
  );
}

if (opt.requireBoard) {
  const boardTag = `#${opt.requireBoard.replace(/^#/, "")}`;
  const hasBoardRef = lines.some((line) => line.includes(boardTag));
  if (!hasBoardRef) {
    fail(`ต้องอ้างอิง canonical board ${boardTag} อย่างน้อย 1 บรรทัด`, 8);
  }
}

if (opt.requireLine1Path) {
  const line1 = lines[0].replace(/^\d+\)\s*/, "");
  const line1Body = line1.replace(/^เปลี่ยน:\s*/, "");
  const hasPathLikeToken = /(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+/.test(line1Body);
  if (!hasPathLikeToken) {
    fail("บรรทัด 'เปลี่ยน:' ต้องมี path ของไฟล์ที่แก้ (เช่น docs/process/x.md)", 11);
  }
}

const evidenceLine = lines[3].replace(/^\d+\)\s*/, "");
const claimsPushVerified = /(push\s*ยืนยันแล้ว|pushed\s*verified|ขึ้น\s*remote\s*แล้ว)/i.test(evidenceLine);
const hasTraceableProof = /(commit\s+[0-9a-f]{7,40}|\b[0-9a-f]{7,40}\b|https?:\/\/\S+)/i.test(evidenceLine);
const hasExplicitBlocker = /(blocker|ติดบล็อก|blocked|local\s*เท่านั้น|push\s*ไม่ได้|auth|network|remote\s*reject)/i.test(
  evidenceLine
);
if (!hasTraceableProof && !hasExplicitBlocker) {
  fail("บรรทัดหลักฐานต้องมี commit/URL ที่ตรวจสอบได้ หรือระบุ blocker ชัดเจน", 9);
}
if (claimsPushVerified && !hasTraceableProof) {
  fail("ห้ามอ้างว่า push ยืนยันแล้วถ้าไม่มี commit hash หรือ URL ในบรรทัดหลักฐาน", 10);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      lines: lines.length,
      maxLineChars: opt.maxLineChars,
      prefixes,
    },
    null,
    2
  )
);
