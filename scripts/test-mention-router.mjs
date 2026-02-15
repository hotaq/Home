import assert from "node:assert/strict";

const MAX_MENTIONS_PER_COMMENT = 2;

function cleanForMentionParsing(commentBody) {
  let cleaned = commentBody;
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  const footerIdx = cleaned.lastIndexOf("\n---\n");
  if (footerIdx !== -1) cleaned = cleaned.substring(0, footerIdx);
  cleaned = cleaned
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n");
  return cleaned;
}

function isReportStyle(commentBody) {
  const headingCount = (commentBody.match(/^#{1,6}\s+/gm) || []).length;
  return headingCount >= 3;
}

function parseMentions(commentBody, bots, commentAuthor = "unknown") {
  if (isReportStyle(commentBody)) return { matched: [], unmatched: [] };

  const cleaned = cleanForMentionParsing(commentBody);
  const firstLine = cleaned
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (!firstLine || !firstLine.startsWith("@")) return { matched: [], unmatched: [] };

  const mentionPattern = /@([a-z0-9][\w-]*)/gi;
  const matches = [...firstLine.matchAll(mentionPattern)];
  if (matches.length === 0) return { matched: [], unmatched: [] };

  const ignoredHandles = new Set([
    String(commentAuthor || "").toLowerCase(),
    "hotaq",
    "github-actions",
    "github-actions-bot",
    "mention",
  ]);

  const matched = [];
  const unmatched = [];

  for (const m of matches) {
    const name = m[1].toLowerCase();
    if (ignoredHandles.has(name)) continue;

    const bot = bots.find(
      (b) =>
        b.id.toLowerCase() === name ||
        b.displayName.toLowerCase() === name ||
        b.id.toLowerCase().startsWith(name + "-") ||
        b.id.toLowerCase().startsWith(name)
    );

    if (bot && !matched.find((x) => x.id === bot.id)) matched.push(bot);
    else if (!bot && !unmatched.includes(name)) unmatched.push(name);
  }

  return {
    matched: matched.slice(0, MAX_MENTIONS_PER_COMMENT),
    unmatched: unmatched.slice(0, MAX_MENTIONS_PER_COMMENT - matched.length),
  };
}

const bots = [
  { id: "jin-core", displayName: "Jin" },
  { id: "nanta-zealot", displayName: "Nanta" },
  { id: "arachia-steward", displayName: "Arachia" },
  { id: "scribe-bot", displayName: "shoji" },
];

function ids(result) {
  return result.matched.map((b) => b.id);
}

// 1) Normal command mention
{
  const r = parseMentions("@nanta ช่วยดู risk ให้หน่อย", bots, "hotaq");
  assert.deepEqual(ids(r), ["nanta-zealot"]);
  assert.deepEqual(r.unmatched, []);
}

// 2) Report-style should not trigger
{
  const body = `## Header\n### KPI\n#### Result\n@nanta check`;
  const r = parseMentions(body, bots, "hotaq");
  assert.deepEqual(ids(r), []);
  assert.deepEqual(r.unmatched, []);
}

// 3) Quote/code mentions ignored
{
  const body = `> @nanta old mention\n\n\`\`\`\n@arachia hidden\n\`\`\`\n@jin ช่วยปิดงาน`;
  const r = parseMentions(body, bots, "hotaq");
  assert.deepEqual(ids(r), ["jin-core"]);
}

// 4) Unknown fallback candidate
{
  const r = parseMentions("@unknownbot test", bots, "hotaq");
  assert.deepEqual(ids(r), []);
  assert.deepEqual(r.unmatched, ["unknownbot"]);
}

// 5) Ignore self/system handles
{
  const r = parseMentions("@hotaq @github-actions @mention", bots, "hotaq");
  assert.deepEqual(ids(r), []);
  assert.deepEqual(r.unmatched, []);
}

// 6) First actionable line only
{
  const body = `hello team\n@nanta should not trigger`; // first non-empty line does not start with @
  const r = parseMentions(body, bots, "hotaq");
  assert.deepEqual(ids(r), []);
}

console.log("✅ mention router tests passed (6 cases)");
