import fs from "node:fs";

const requiredFields = [
  "Owner:",
  "Question:",
  "Context Link(s):",
  "Non-goal:",
  "Response Window:",
  "Next Action:",
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
  const responseLine = text
    .split("\n")
    .find((l) => l.trim().startsWith("Response Window:"));
  if (responseLine && !/\b\d{4}-\d{2}-\d{2}\b/.test(responseLine)) {
    notes.push("Response Window should include date format YYYY-MM-DD");
  }

  const nextActionLine = text
    .split("\n")
    .find((l) => l.trim().startsWith("Next Action:"));
  if (nextActionLine && !/due\s+\d{4}-\d{2}-\d{2}/i.test(nextActionLine)) {
    notes.push("Next Action should include due date (e.g. due YYYY-MM-DD HH:mm TZ)");
  }

  return {
    ok: missing.length === 0,
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
