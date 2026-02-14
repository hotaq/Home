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
  if (botId === "nanta-zealot") return "🔥 [Nanta]";
  if (botId === "hootoo-founder") return "👑 [Hootoo]";
  return "🤖 [Cult Bot]";
}

function withAuditFooter({ body, actorId }) {
  const runId = process.env.GITHUB_RUN_ID || "local";
  const source = process.env.GITHUB_ACTOR || "unknown";
  const ts = new Date().toISOString();

  return `${body}\n\n---\nactor: ${actorId}\nsource: ${source}\nrun-id: ${runId}\nts: ${ts}`;
}

function ritualTemplate(botId, topic) {
  const t = topic || "(ยังไม่ระบุหัวข้อ)";

  if (botId === "jin-core") {
    return `${getActorLabel(botId)} 🧵 ritual-thread: strategy\n\nหัวข้อพิธี: **${t}**\n\n- เป้าหมายหลักของรอบนี้คืออะไร\n- ขอบเขตที่ต้องทำภายใน 24-48 ชม.\n- เกณฑ์ตัดสินว่า "สำเร็จ" คืออะไร\n\nNext action: เจ้าของ issue ยืนยันเป้าหมาย 1 ประโยค`;
  }

  if (botId === "scribe-bot") {
    return `${getActorLabel(botId)} 🧵 ritual-thread: implementation\n\nหัวข้อพิธี: **${t}**\n\n- แผนลงมือทำ 3 ขั้น\n- สิ่งที่ต้องเตรียมก่อนเริ่ม\n- output ที่ควรส่งมอบ\n\nNext action: เลือกขั้นแรกที่จะเริ่มตอนนี้`;
  }

  if (botId === "nanta-zealot") {
    return `${getActorLabel(botId)} 🧵 ritual-thread: risk-review\n\nหัวข้อพิธี: **${t}**\n\n- ความเสี่ยงสูงสุด 3 ข้อ\n- วิธีลดความเสี่ยงแต่ละข้อ\n- จุดที่ต้องให้มนุษย์ตัดสินใจ\n\nNext action: ยืนยัน risk ที่ยอมรับได้/ไม่ได้`;
  }

  return `${getActorLabel(botId)} ritual started: ${t}`;
}

async function postComment({ owner, repo, issueNumber, actorId, body }) {
  const auditedReply = withAuditFooter({ body, actorId });
  return octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: auditedReply
  });
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

  if (commentBody.startsWith("/summon")) {
    const target = commentBody.replace("/summon", "").trim() || "jin-core";
    const found = manifest.bots.find(
      (b) => b.id === target || b.displayName.toLowerCase() === target.toLowerCase()
    );

    const actorId = found?.id || "jin-core";
    const reply = found
      ? `${getActorLabel(actorId)} อัญเชิญ **${found.displayName}** สำเร็จ — role: ${found.role}`
      : `${getActorLabel(actorId)} ⚠️ ไม่พบบอท ${target} ใน manifest`;

    await postComment({ owner, repo, issueNumber, actorId, body: reply });
    console.log("Handled /summon");
    return;
  }

  if (commentBody.startsWith("/oracle")) {
    const actorId = "scribe-bot";
    const q = commentBody.replace("/oracle", "").trim();
    const reply = `${getActorLabel(actorId)} รับคำถามแล้ว -> "${q || "(ไม่มีคำถาม)"}"\n(phase ถัดไปจะผูก LLM response จริง)`;

    await postComment({ owner, repo, issueNumber, actorId, body: reply });
    console.log("Handled /oracle");
    return;
  }

  if (commentBody.startsWith("/silence")) {
    const actorId = "jin-core";
    const reply = `${getActorLabel(actorId)} 🔕 โหมดเงียบถูกเปิดสำหรับเธรดนี้ (mock)`;

    await postComment({ owner, repo, issueNumber, actorId, body: reply });
    console.log("Handled /silence");
    return;
  }

  if (commentBody.startsWith("/ritual")) {
    const topic = commentBody.replace("/ritual", "").trim();
    const ritualBots = ["jin-core", "scribe-bot", "nanta-zealot"];

    const parallelRuns = ritualBots.map((actorId) =>
      postComment({
        owner,
        repo,
        issueNumber,
        actorId,
        body: ritualTemplate(actorId, topic)
      })
    );

    const results = await Promise.all(parallelRuns);

    const summaryActor = "jin-core";
    const links = results
      .map((r, i) => `- ${getActorLabel(ritualBots[i])}: ${r.data.html_url}`)
      .join("\n");

    const summary = `${getActorLabel(summaryActor)} ✅ เปิดพิธีแบบขนานแล้ว\n\nหัวข้อ: **${topic || "(ยังไม่ระบุ)"}**\n\nเธรดย่อยที่สร้างอัตโนมัติ:\n${links}\n\nคำสั่งถัดไปแนะนำ: ใช้ /council vote <proposal> หลังจากอ่านครบ 3 เธรด`;

    await postComment({ owner, repo, issueNumber, actorId: summaryActor, body: summary });
    console.log("Handled /ritual in parallel");
    return;
  }

  const actorId = "jin-core";
  const fallback = "🔮 [Jin] รับรู้พิธีแล้ว แต่ยังไม่พบคำสั่งที่รองรับ";
  await postComment({ owner, repo, issueNumber, actorId, body: fallback });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
