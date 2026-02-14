import { Octokit } from "@octokit/rest";
import fs from "node:fs";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("Missing GITHUB_TOKEN");
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

function loadManifest() {
  return JSON.parse(fs.readFileSync("./cult/manifest.json", "utf8"));
}

function parseRepoFromEnv() {
  const full = process.env.GITHUB_REPOSITORY || "";
  const [owner, repo] = full.split("/");
  return { owner, repo };
}

function getActorLabel(botId) {
  if (botId === "jin-core") return "🧊 [Jin]";
  if (botId === "scribe-bot") return "📜 [Scribe Bot]";
  if (botId === "hootoo-founder") return "👑 [Hootoo]";
  return "🤖 [Cult Bot]";
}

function withAuditFooter({ body, actorId }) {
  const runId = process.env.GITHUB_RUN_ID || "local";
  const source = process.env.GITHUB_ACTOR || "unknown";
  const ts = new Date().toISOString();

  return `${body}\n\n---\nactor: ${actorId}\nsource: ${source}\nrun-id: ${runId}\nts: ${ts}`;
}

async function main() {
  const manifest = loadManifest();
  const { owner, repo } = parseRepoFromEnv();
  if (!owner || !repo) {
    console.log("No GITHUB_REPOSITORY found (probably local run). Exiting safely.");
    return;
  }

  const issueNumber = Number(process.env.ISSUE_NUMBER || 0);
  const commentBody = process.env.COMMENT_BODY || "";

  if (!issueNumber || !commentBody) {
    console.log("No issue context payload. Exiting.");
    return;
  }

  const isCommand = commentBody.trim().startsWith("/");
  if (!isCommand) return;

  let actorId = "jin-core";
  let reply = "🔮 [Jin] รับรู้พิธีแล้ว แต่ยังไม่พบคำสั่งที่รองรับ";

  if (commentBody.startsWith("/summon")) {
    const target = commentBody.replace("/summon", "").trim() || "jin-core";
    const found = manifest.bots.find(
      (b) => b.id === target || b.displayName.toLowerCase() === target.toLowerCase()
    );

    if (found) {
      actorId = found.id;
      reply = `${getActorLabel(actorId)} อัญเชิญ **${found.displayName}** สำเร็จ — role: ${found.role}`;
    } else {
      actorId = "jin-core";
      reply = `${getActorLabel(actorId)} ⚠️ ไม่พบบอท ${target} ใน manifest`;
    }
  }

  if (commentBody.startsWith("/oracle")) {
    actorId = "scribe-bot";
    const q = commentBody.replace("/oracle", "").trim();
    reply = `${getActorLabel(actorId)} รับคำถามแล้ว -> "${q || "(ไม่มีคำถาม)"}"\n(phase ถัดไปจะผูก LLM response จริง)`;
  }

  if (commentBody.startsWith("/silence")) {
    actorId = "jin-core";
    reply = `${getActorLabel(actorId)} 🔕 โหมดเงียบถูกเปิดสำหรับเธรดนี้ (mock)`;
  }

  const auditedReply = withAuditFooter({ body: reply, actorId });

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: auditedReply
  });

  console.log("Replied to issue", issueNumber, "as", actorId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
