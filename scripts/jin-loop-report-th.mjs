#!/usr/bin/env node
import fs from "node:fs";

function parseArgs(argv) {
  const out = {
    changed: "",
    why: "",
    next: "",
    commit: "",
    link: "",
    preflightJson: "",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--changed") out.changed = argv[++i] ?? "";
    else if (a === "--why") out.why = argv[++i] ?? "";
    else if (a === "--next") out.next = argv[++i] ?? "";
    else if (a === "--commit") out.commit = argv[++i] ?? "";
    else if (a === "--link") out.link = argv[++i] ?? "";
    else if (a === "--preflight-json") out.preflightJson = argv[++i] ?? "";
    else if (a === "-h" || a === "--help") {
      console.log(`Usage: node scripts/jin-loop-report-th.mjs --changed <text> --why <text> --next <text> [--commit <sha>] [--link <url>] [--preflight-json <path>]\n\nOutputs exactly 4 Thai lines for cron loop reports.`);
      process.exit(0);
    }
  }

  if (!out.changed || !out.why || !out.next) {
    console.error("Missing required fields: --changed --why --next");
    process.exit(2);
  }

  return out;
}

function readPreflight(path) {
  if (!path) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function oneLine(text) {
  return String(text || "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const opt = parseArgs(process.argv);
const preflight = readPreflight(opt.preflightJson);

if (opt.preflightJson && !preflight) {
  console.error("โหลด preflight JSON ไม่ได้: หยุดรายงานเพื่อกันสถานะผิดพลาด");
  process.exit(3);
}

if (preflight && Array.isArray(preflight.reasons) && preflight.reasons.length > 0) {
  console.error(
    `preflight blocked (${preflight.reasons.join("; ")}): หยุดรายงานความคืบหน้าเพื่อกัน false-positive`
  );
  process.exit(4);
}

const dirtyNote = preflight?.dirtyWorkspace
  ? " (กันพลาด: มีไฟล์ค้าง จึงแยก stage เฉพาะงานนี้)"
  : "";

const line1 = `เปลี่ยน: ${oneLine(opt.changed)}`;
const line2 = `ช่วยได้: ${oneLine(opt.why)}${dirtyNote}`;
const line3 = `ถัดไป: ${oneLine(opt.next)}`;
const proof = opt.link ? oneLine(opt.link) : opt.commit ? `commit ${oneLine(opt.commit)}` : "ไม่มีลิงก์ (ยังไม่ commit)";
const line4 = `หลักฐาน: ${proof}`;

console.log([line1, line2, line3, line4].join("\n"));
