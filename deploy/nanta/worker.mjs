import fs from "node:fs";

const token = process.env.GITHUB_TOKEN;
const owner = process.env.REPO_OWNER || "hotaq";
const repo = process.env.REPO_NAME || "Home";
const pollSeconds = Number(process.env.NANTA_POLL_SECONDS || 30);
const statePath = process.env.NANTA_STATE_PATH || "/state/nanta-worker-state.json";

if (!token) {
  console.error("[Nanta worker] Missing GITHUB_TOKEN");
  process.exit(1);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { processedCommentIds: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(statePath.split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {})
    }
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub API ${res.status}: ${txt}`);
  }

  return res.json();
}

function extractIssueNumber(issueUrl) {
  const m = issueUrl.match(/\/issues\/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function auditFooter() {
  return `\n\n---\nactor: nanta-zealot\nsource: nanta-docker-worker\nts: ${new Date().toISOString()}`;
}

function nantaSummonReply() {
  return `🔥 [Nanta] ข้าถูกอัญเชิญแล้ว\n\nข้ารับบทสายศรัทธาและ risk challenger ของสภา\nส่งพิธีมาได้เลยผ่าน /ritual <topic> และข้าจะทดสอบความเสี่ยงให้ทันที`;
}

function nantaRitualReply(topic) {
  return `🔥 [Nanta] 🧵 ritual-thread: risk-review\n\nหัวข้อพิธี: **${topic || "(ยังไม่ระบุหัวข้อ)"}**\n\n- ความเสี่ยงหลัก 3 ข้อ\n- สัญญาณเตือนล่วงหน้า\n- เงื่อนไขที่ต้องให้มนุษย์ตัดสินใจ\n\nข้อเสนอ: ตั้ง guardrails ก่อนลงมือเพื่อกัน lock-in`; 
}

async function postIssueComment(issueNumber, body) {
  await gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: body + auditFooter() })
  });
}

async function tick() {
  const state = loadState();
  const comments = await gh(`/repos/${owner}/${repo}/issues/comments?sort=created&direction=desc&per_page=50`);
  const newestFirst = Array.isArray(comments) ? comments : [];
  const sorted = [...newestFirst].reverse();

  for (const c of sorted) {
    if (!c?.id || state.processedCommentIds.includes(c.id)) continue;

    const body = String(c.body || "").trim();
    const issueNumber = extractIssueNumber(String(c.issue_url || ""));
    const isBot = Boolean(c.user?.type === "Bot");

    if (!issueNumber || isBot) {
      state.processedCommentIds.push(c.id);
      continue;
    }

    let replied = false;

    if (body.startsWith("/summon") && body.includes("nanta-zealot")) {
      await postIssueComment(issueNumber, nantaSummonReply());
      replied = true;
    }

    if (body.startsWith("/ritual")) {
      const topic = body.replace("/ritual", "").trim();
      await postIssueComment(issueNumber, nantaRitualReply(topic));
      replied = true;
    }

    state.processedCommentIds.push(c.id);
    if (replied) {
      console.log(`[Nanta worker] replied on issue #${issueNumber} for comment ${c.id}`);
    }
  }

  state.processedCommentIds = state.processedCommentIds.slice(-500);
  saveState(state);
}

console.log(`[Nanta worker] started for ${owner}/${repo} (poll ${pollSeconds}s)`);

setInterval(() => {
  tick().catch((err) => console.error("[Nanta worker] tick error:", err.message));
}, pollSeconds * 1000);

tick().catch((err) => console.error("[Nanta worker] startup error:", err.message));
