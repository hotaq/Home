import fs from "node:fs";

const requiredFields = [
  "Owner:",
  "Question:",
  "Context Link(s):",
  "Non-goal:",
  "Response Window:",
  "Next Action:",
];

const canonicalBoardMatchers = [
  /\b#3\b/,
  /\/issues\/3\b/i,
  /\/discussions\/3\b/i,
];

function lintThreadCard(text) {
  const hasThreadCard = text.includes("[Thread Card]");
  if (!hasThreadCard) {
    return {
      ok: false,
      missing: ["[Thread Card]"],
      notes: ["Missing Thread Card header"],
    };
  }

  const missing = requiredFields.filter((f) => !text.includes(f));
  const notes = [];

  // minimal format checks
  const lines = text.split("\n");

  const contextLine = lines.find((l) => l.trim().startsWith("Context Link(s):"));
  if (contextLine && !canonicalBoardMatchers.some((re) => re.test(contextLine))) {
    notes.push("Context Link(s) should include canonical board reference (#3 / issue 3)");
  }

  const responseLine = lines.find((l) => l.trim().startsWith("Response Window:"));
  if (responseLine && !/\b\d{4}-\d{2}-\d{2}\b/.test(responseLine)) {
    notes.push("Response Window should include date format YYYY-MM-DD");
  }
  if (responseLine && !/\b(UTC|GMT|UTC[+-]\d{1,2}|[A-Z]{2,5}|UTC\+7)\b/i.test(responseLine)) {
    notes.push("Response Window should include timezone (e.g. UTC, UTC+7)");
  }

  const nextActionLine = lines.find((l) => l.trim().startsWith("Next Action:"));
  if (nextActionLine && !/due\s+\d{4}-\d{2}-\d{2}/i.test(nextActionLine)) {
    notes.push("Next Action should include due date (e.g. due YYYY-MM-DD HH:mm TZ)");
  }

  return {
    ok: missing.length === 0 && notes.length === 0,
    missing,
    notes,
  };
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/lint-thread-card.mjs <file>");
    process.exit(2);
  }

  const text = fs.readFileSync(inputPath, "utf8");
  const result = lintThreadCard(text);

  console.log("Thread Card Lint Result:");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) process.exit(1);
}

main();
