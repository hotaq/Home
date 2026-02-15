#!/usr/bin/env node
import fs from "node:fs";

function parseArgs(argv) {
  const out = {
    changed: "",
    why: "",
    next: "",
    blocker: "",
    commit: "",
    link: "",
    board: "3",
    preflightJson: "",
    pushProofJson: "",
    maxLineChars: 180,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--changed") out.changed = argv[++i] ?? "";
    else if (a === "--why") out.why = argv[++i] ?? "";
    else if (a === "--next") out.next = argv[++i] ?? "";
    else if (a === "--blocker") out.blocker = argv[++i] ?? "";
    else if (a === "--commit") out.commit = argv[++i] ?? "";
    else if (a === "--link") out.link = argv[++i] ?? "";
    else if (a === "--preflight-json") out.preflightJson = argv[++i] ?? "";
    else if (a === "--push-proof-json") out.pushProofJson = argv[++i] ?? "";
    else if (a === "--board") out.board = argv[++i] ?? "3";
    else if (a === "--max-line-chars") out.maxLineChars = Number(argv[++i] ?? "180");
    else if (a === "-h" || a === "--help") {
      console.log(`Usage: node scripts/jin-loop-report-th.mjs (--changed <text> --why <text> --next <text> | --blocker <text>) [--commit <sha>] [--link <url>] [--board <id>] [--preflight-json <path>] [--push-proof-json <path>] [--max-line-chars <n>]\n\nOutputs exactly 4 Thai lines for cron loop reports.`);
      process.exit(0);
    }
  }

  const hasNormal = Boolean(out.changed && out.why && out.next);
  const hasBlocker = Boolean(out.blocker);

  if (!hasNormal && !hasBlocker) {
    console.error("Missing required fields: provide --changed --why --next OR --blocker");
    process.exit(2);
  }

  if (hasNormal && hasBlocker) {
    console.error("Use either normal mode or blocker mode, not both");
    process.exit(2);
  }

  return out;
}

function readJson(path) {
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

function ensureLineLength(lines, maxChars) {
  if (!Number.isFinite(maxChars) || maxChars < 60) {
    console.error("--max-line-chars ต้องเป็นตัวเลข >= 60");
    process.exit(6);
  }

  const tooLong = lines
    .map((line, index) => ({ index: index + 1, len: line.length }))
    .filter((x) => x.len > maxChars);

  if (tooLong.length > 0) {
    const detail = tooLong.map((x) => `L${x.index}=${x.len}`).join(", ");
    console.error(`รายงานยาวเกินกำหนด (${detail}) > ${maxChars} chars`);
    process.exit(7);
  }
}

const opt = parseArgs(process.argv);
const preflight = readJson(opt.preflightJson);
const pushProof = readJson(opt.pushProofJson);

if (opt.preflightJson && !preflight) {
  console.error("โหลด preflight JSON ไม่ได้: หยุดรายงานเพื่อกันสถานะผิดพลาด");
  process.exit(3);
}

if (opt.pushProofJson && !pushProof) {
  console.error("โหลด push-proof JSON ไม่ได้: หยุดรายงานเพื่อกันสถานะ push ผิดพลาด");
  process.exit(5);
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

const boardId = oneLine(opt.board || "3").replace(/^#*/, "") || "3";
if (boardId !== "3") {
  console.error(`รองรับเฉพาะ canonical board #3 เท่านั้น (ได้รับ #${boardId})`);
  process.exit(8);
}
const boardNote = ` (ยึดบอร์ดหลัก #${boardId})`;

function pushStatusText(proof, commit, link) {
  if (!proof) {
    if (link) return oneLine(link);
    if (commit) return `commit ${oneLine(commit)} (ยังไม่ตรวจ push)`;
    return "ไม่มีลิงก์ (ยังไม่ commit)";
  }

  const proofHead = proof?.head ? oneLine(proof.head) : "";

  if (proof.ok) {
    if (link) return `${oneLine(link)} (push ยืนยันแล้ว)`;
    if (commit) return `commit ${oneLine(commit)} (push ยืนยันแล้ว)`;
    if (proofHead) return `commit ${proofHead} (push ยืนยันแล้ว)`;
    return "ยังไม่ยืนยันหลักฐาน push แบบอ้างอิงได้";
  }

  const failed = Array.isArray(proof.checks)
    ? proof.checks.filter((c) => !c.ok).map((c) => c.name)
    : [];
  const reason = failed.length > 0 ? failed.join(",") : "push_unverified";

  if (commit) return `commit ${oneLine(commit)} (local เท่านั้น: ${reason})`;
  if (proofHead) return `commit ${proofHead} (local เท่านั้น: ${reason})`;
  if (link) return `${oneLine(link)} (เตือน: push ยังไม่ยืนยัน ${reason})`;
  return `ยังไม่ยืนยัน push (${reason})`;
}

const blockerText = oneLine(opt.blocker);
const isBlocked = Boolean(blockerText);

const line1 = isBlocked
  ? `เปลี่ยน: ติด blocker — ยังไม่ลงมือแก้งานเชิงโค้ด (${blockerText})`
  : `เปลี่ยน: ${oneLine(opt.changed)}`;
const line2 = isBlocked
  ? `ช่วยได้: ลดความเสี่ยงรายงานหลอกว่าคืบหน้า ทั้งที่รอบนี้ติดบล็อก${boardNote}${dirtyNote}`
  : `ช่วยได้: ${oneLine(opt.why)}${boardNote}${dirtyNote}`;
const line3 = isBlocked
  ? `ถัดไป: เคลียร์ blocker ก่อน — ${blockerText}`
  : `ถัดไป: ${oneLine(opt.next)}`;
const line4 = isBlocked
  ? `หลักฐาน: blocker=${blockerText}; ${pushStatusText(pushProof, opt.commit, opt.link)}`
  : `หลักฐาน: ${pushStatusText(pushProof, opt.commit, opt.link)}`;

const lines = [line1, line2, line3, line4];
const numberedLines = lines.map((line, idx) => `${idx + 1}) ${line}`);
ensureLineLength(numberedLines, opt.maxLineChars);
console.log(numberedLines.join("\n"));
