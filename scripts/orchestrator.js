import { Octokit } from "@octokit/rest";
import fs from "node:fs";
import crypto from "node:crypto";

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
  if (botId === "arachia-steward") return "🎖️ [Arachia]";
  return "🤖 [Cult Bot]";
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CANONICAL_CONTEXT_ID = "issue-3";

const DEFAULT_EVENT_SOURCE = "auto";
const ALLOWED_EVENT_STATUS = new Set(["send", "ack", "error", "retry"]);
const ALLOWED_EVENT_SOURCE = new Set(["manual", "auto", "cache"]);

function normalizeEventStatus(status) {
  if (ALLOWED_EVENT_STATUS.has(status)) return status;
  return "error";
}

function normalizeEventSource(source) {
  if (ALLOWED_EVENT_SOURCE.has(source)) return source;
  return DEFAULT_EVENT_SOURCE;
}

function createEventEnvelope({
  issueNumber,
  actorId,
  status = "send",
  source = DEFAULT_EVENT_SOURCE,
  runId = process.env.GITHUB_RUN_ID || "local",
  sourceActor = process.env.GITHUB_ACTOR || "unknown",
}) {
  const updatedAt = new Date().toISOString();
  const contextId = Number(issueNumber) ? `issue-${Number(issueNumber)}` : "issue-unknown";
  const eventId = `${runId}:${actorId}:${crypto.randomUUID()}`;

  return {
    event_id: eventId,
    channel: "acp",
    context_id: contextId,
    status: normalizeEventStatus(status),
    source: normalizeEventSource(source),
    updated_at: updatedAt,
    run_id: runId,
    source_actor: sourceActor,
  };
}

function emitEventLog({ issueNumber, actorId, status, source = DEFAULT_EVENT_SOURCE, reason = "" }) {
  const envelope = createEventEnvelope({ issueNumber, actorId, status, source });
  const message = reason ? `${status}: ${reason}` : status;
  console.log(`[acp-event] ${message} | ${JSON.stringify(envelope)}`);
  return envelope;
}

function mapGitHubErrorToHuman(err) {
  const status = Number(err?.status || 0);
  const msg = String(err?.message || "").toLowerCase();

  if (status === 401 || status === 403) return "สิทธิ์ไม่พอสำหรับโพสต์คอมเมนต์ (auth/permission)";
  if (status === 404) return "ไม่พบ issue/repo ที่ต้องการโพสต์";
  if (status === 422) return "GitHub ปฏิเสธเนื้อหา (validation failed)";
  if (status === 429 || msg.includes("rate limit")) return "ชน rate limit ของ GitHub";
  if (status >= 500) return "GitHub ฝั่งเซิร์ฟเวอร์มีปัญหาชั่วคราว";
  return "โพสต์คอมเมนต์ไม่สำเร็จ (unknown github api error)";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withAuditFooter({ body, actorId, routerDecision, dedupeKey, issueNumber, status = "send", source = DEFAULT_EVENT_SOURCE }) {
  const envelope = createEventEnvelope({ issueNumber, actorId, status, source });

  let footer = `---\nactor: ${actorId}\nsource: ${envelope.source_actor}\nrun-id: ${envelope.run_id}\nts: ${envelope.updated_at}`;
  footer += `\nevent_id: ${envelope.event_id}`;
  footer += `\nchannel: ${envelope.channel}`;
  footer += `\ncontext_id: ${envelope.context_id}`;
  footer += `\nstatus: ${envelope.status}`;
  footer += `\nsource_type: ${envelope.source}`;
  footer += `\nupdated_at: ${envelope.updated_at}`;

  if (routerDecision) {
    footer += `\nrouter: ${routerDecision}`;
  }
  if (dedupeKey) {
    footer += `\ndedupe-key: ${dedupeKey}`;
  }
  return `${body}\n\n${footer}`;
}

// ── Mention Router ──────────────────────────────────────────────

const MAX_MENTIONS_PER_COMMENT = 2;

/**
 * Clean comment body before mention parsing:
 * - Remove quote blocks (lines starting with >)
 * - Remove code blocks (``` ... ```)
 * - Remove audit footer (everything after the last ---)
 */
function cleanForMentionParsing(commentBody) {
  let cleaned = commentBody;

  // Remove code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");

  // Remove audit footer (last --- section)
  const footerIdx = cleaned.lastIndexOf("\n---\n");
  if (footerIdx !== -1) {
    cleaned = cleaned.substring(0, footerIdx);
  }

  // Remove quote lines
  cleaned = cleaned
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n");

  return cleaned;
}

/**
 * Detect report-style comments (has 3+ markdown headings).
 * These are summaries/reports and should not trigger mention routing.
 */
function isReportStyle(commentBody) {
  const headingCount = (commentBody.match(/^#{1,6}\s+/gm) || []).length;
  return headingCount >= 3;
}

/**
 * Parse @mentions from comment body.
 * v1.2 guardrails:
 * - Only parse the first non-empty actionable line
 * - Actionable line must start with @mention
 * - Ignore self/system handles to avoid proxy spam
 * Returns { matched: Bot[], unmatched: string[] }
 */
function parseMentions(commentBody, manifest, commentAuthor) {
  // Skip report-style comments
  if (isReportStyle(commentBody)) {
    console.log("Report-style comment detected, skipping mention parsing.");
    return { matched: [], unmatched: [] };
  }

  // Clean before parsing
  const cleaned = cleanForMentionParsing(commentBody);
  const firstLine = cleaned
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (!firstLine || !firstLine.startsWith("@")) {
    return { matched: [], unmatched: [] };
  }

  // Match @word patterns from first line only
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
  for (const match of matches) {
    const name = match[1].toLowerCase();
    if (ignoredHandles.has(name)) continue;

    const bot = manifest.bots.find(
      (b) =>
        b.id.toLowerCase() === name ||
        b.displayName.toLowerCase() === name ||
        // Also match short aliases: e.g. "arachia" matches "arachia-steward"
        b.id.toLowerCase().startsWith(name + "-") ||
        b.id.toLowerCase().startsWith(name)
    );

    if (bot && !matched.find((m) => m.id === bot.id)) {
      matched.push(bot);
    } else if (!bot && !unmatched.includes(name)) {
      unmatched.push(name);
    }
  }

  // Cap mentions per comment
  return {
    matched: matched.slice(0, MAX_MENTIONS_PER_COMMENT),
    unmatched: unmatched.slice(0, MAX_MENTIONS_PER_COMMENT - matched.length),
  };
}

/**
 * Check cooldown: count how many comments by github-actions for this bot
 * in this issue. Returns true if under limit.
 */
async function checkCooldown({ owner, repo, issueNumber, actorId, manifest }) {
  const limit = manifest.limits?.maxBotRepliesPerThread || 8;

  try {
    const comments = await octokit.paginate(octokit.issues.listComments, {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    const botComments = comments.filter(
      (c) =>
        c.body.includes(`actor: ${actorId}`) &&
        (c.user.login === "github-actions" ||
          c.user.login === "github-actions[bot]")
    );

    if (botComments.length >= limit) {
      console.log(
        `Cooldown: ${actorId} has ${botComments.length}/${limit} replies in issue #${issueNumber}. Blocked.`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("Cooldown check failed, allowing:", err.message);
    return true; // fail-open
  }
}

/**
 * Handle @mention routing.
 * Returns true if handled, false if no mentions found.
 */
async function handleMentionRoute({
  owner,
  repo,
  issueNumber,
  commentBody,
  commentAuthor,
  manifest,
  dedupeKeyFor,
}) {
  // Don't process bot comments (prevent loops)
  if (
    commentAuthor === "github-actions" ||
    commentAuthor === "github-actions[bot]"
  ) {
    console.log("Skipping bot comment to prevent loop.");
    return true; // consumed, but no action
  }

  const { matched, unmatched } = parseMentions(commentBody, manifest, commentAuthor);

  if (matched.length === 0 && unmatched.length === 0) return false;

  // Handle matched bots
  for (const bot of matched) {
    // Check if bot is enabled
    if (!bot.enabled) {
      // Jin proxy
      const proxyBody = `🧊 [Jin] ⚠️ **${bot.displayName}** ไม่พร้อมใช้งานตอนนี้ (disabled)\n\nJin รับแทน — กรุณาระบุสิ่งที่ต้องการ`;
      const canPost = await checkCooldown({
        owner,
        repo,
        issueNumber,
        actorId: "jin-core",
        manifest,
      });
      if (canPost) {
        await postComment({
          owner,
          repo,
          issueNumber,
          actorId: "jin-core",
          body: proxyBody,
          routerDecision: `proxy for disabled ${bot.id}`,
          dedupeKey: dedupeKeyFor?.("jin-core", `proxy-disabled-${bot.id}`),
        });
      }
      continue;
    }

    // Cooldown check
    const canPost = await checkCooldown({
      owner,
      repo,
      issueNumber,
      actorId: bot.id,
      manifest,
    });

    if (!canPost) {
      console.log(`Cooldown hit for ${bot.id}, skipping.`);
      continue;
    }

    // Build response
    const label = getActorLabel(bot.id);
    // Strip the @mention itself to get the message content
    const messageContent = commentBody
      .replace(new RegExp(`@${escapeRegExp(bot.displayName)}\\b`, "gi"), "")
      .replace(new RegExp(`@${escapeRegExp(bot.id)}\\b`, "gi"), "")
      .trim();

    const reply = `${label} รับทราบ — ถูก mention โดย @${commentAuthor}\n\n> ${messageContent || "(ไม่มีข้อความเพิ่มเติม)"}\n\nRole: **${bot.role}** | Persona: ${bot.persona}`;

    await postComment({
      owner,
      repo,
      issueNumber,
      actorId: bot.id,
      body: reply,
      routerDecision: `mention-route to ${bot.id}`,
      dedupeKey: dedupeKeyFor?.(bot.id, `mention-route-${bot.id}`),
    });

    console.log(`Routed mention to ${bot.id}`);
  }

  // Handle unmatched mentions — Jin proxy
  for (const name of unmatched) {
    const canPost = await checkCooldown({
      owner,
      repo,
      issueNumber,
      actorId: "jin-core",
      manifest,
    });
    if (canPost) {
      const proxyBody = `🧊 [Jin] ⚠️ ไม่พบบอท **@${name}** ใน manifest\n\nJin รับแทน — กรุณาตรวจชื่อบอทหรือใช้ \`/summon\` เพื่อเรียกบอทที่มีอยู่`;
      await postComment({
        owner,
        repo,
        issueNumber,
        actorId: "jin-core",
        body: proxyBody,
        routerDecision: `proxy for unknown @${name}`,
        dedupeKey: dedupeKeyFor?.("jin-core", `proxy-unknown-${name}`),
      });
      console.log(`Jin proxy for unknown mention: @${name}`);
    }
  }

  return true;
}

// ── Existing handlers ───────────────────────────────────────────

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

  if (botId === "arachia-steward") {
    return `${getActorLabel(botId)} 🧵 ritual-thread: culture-check\n\nหัวข้อพิธี: **${t}**\n\n- สรุปประเด็นหลักจนถึงตอนนี้\n- Discussion ยังอยู่ใน scope หรือไม่\n- สิ่งที่ต้องตัดสินใจก่อนเดินต่อ\n\nNext action: ยืนยัน scope แล้วเลือก next step`;
  }

  return `${getActorLabel(botId)} ritual started: ${t}`;
}

async function hasDedupeComment({ owner, repo, issueNumber, actorId, dedupeKey }) {
  if (!dedupeKey) return false;

  const comments = await octokit.paginate(octokit.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  return comments.some(
    (c) =>
      c.body.includes(`actor: ${actorId}`) &&
      c.body.includes(`dedupe-key: ${dedupeKey}`) &&
      (c.user.login === "github-actions" || c.user.login === "github-actions[bot]")
  );
}

async function postComment({
  owner,
  repo,
  issueNumber,
  actorId,
  body,
  routerDecision,
  dedupeKey,
  status = "send",
  source = DEFAULT_EVENT_SOURCE,
}) {
  if (dedupeKey) {
    const duplicated = await hasDedupeComment({
      owner,
      repo,
      issueNumber,
      actorId,
      dedupeKey,
    });
    if (duplicated) {
      emitEventLog({
        issueNumber,
        actorId,
        status: "ack",
        source,
        reason: `duplicate-skip (${dedupeKey})`,
      });
      console.log(`Duplicate detected for ${actorId} (${dedupeKey}), skip posting.`);
      return null;
    }
  }

  const auditedReply = withAuditFooter({
    body,
    actorId,
    routerDecision,
    dedupeKey,
    issueNumber,
    status,
    source,
  });

  try {
    const res = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: auditedReply,
    });
    emitEventLog({ issueNumber, actorId, status: "send", source, reason: "comment-posted" });
    return res;
  } catch (err) {
    const humanError = mapGitHubErrorToHuman(err);
    console.error(`Post failed (${actorId}): ${humanError}`);

    const shouldRetry = Number(err?.status || 0) >= 500 || Number(err?.status || 0) === 429;
    if (!shouldRetry) {
      emitEventLog({ issueNumber, actorId, status: "error", source, reason: humanError });
      throw err;
    }

    console.log(`Retry once for ${actorId} in 1200ms...`);
    await sleep(1200);

    try {
      const retryRes = await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: withAuditFooter({
          body,
          actorId,
          routerDecision: routerDecision ? `${routerDecision} (retry)` : "retry",
          dedupeKey,
          issueNumber,
          status: "retry",
          source,
        }),
      });
      emitEventLog({ issueNumber, actorId, status: "retry", source, reason: "retry-posted" });
      return retryRes;
    } catch (retryErr) {
      const retryHumanError = mapGitHubErrorToHuman(retryErr);
      emitEventLog({ issueNumber, actorId, status: "error", source, reason: `retry-failed: ${retryHumanError}` });
      throw retryErr;
    }
  }
}

async function main() {
  const manifest = loadManifest();
  const { owner, repo } = parseRepoFromEnv();
  if (!owner || !repo) {
    console.log(
      "No GITHUB_REPOSITORY found (probably local run). Exiting safely."
    );
    return;
  }

  const issueNumber = Number(process.env.ISSUE_NUMBER || 0);
  const commentBody = process.env.COMMENT_BODY || "";
  const commentAuthor = process.env.COMMENT_AUTHOR || process.env.GITHUB_ACTOR || "unknown";
  const commentId = String(process.env.COMMENT_ID || "").trim();
  const dedupeKeyFor = (actorId, action) =>
    commentId ? `${issueNumber}:${commentId}:${actorId}:${action}` : undefined;

  if (!issueNumber || !commentBody) {
    console.log("No issue context payload. Exiting.");
    return;
  }

  const expectedIssueNumber = Number(CANONICAL_CONTEXT_ID.replace("issue-", ""));
  if (issueNumber !== expectedIssueNumber) {
    console.log(
      `Canonical context lock active: expected #${expectedIssueNumber}, got #${issueNumber}. Exiting.`
    );
    return;
  }

  // ── 1) Command handler (existing, priority) ──
  const isCommand = commentBody.trim().startsWith("/");

  if (isCommand) {
    if (commentBody.startsWith("/summon")) {
      const target = commentBody.replace("/summon", "").trim() || "jin-core";
      const found = manifest.bots.find(
        (b) =>
          b.id === target ||
          b.displayName.toLowerCase() === target.toLowerCase()
      );

      const actorId = found?.id || "jin-core";
      const reply = found
        ? `${getActorLabel(actorId)} อัญเชิญ **${found.displayName}** สำเร็จ — role: ${found.role}`
        : `${getActorLabel(actorId)} ⚠️ ไม่พบบอท ${target} ใน manifest`;

      await postComment({
        owner,
        repo,
        issueNumber,
        actorId,
        body: reply,
        dedupeKey: dedupeKeyFor(actorId, "summon"),
      });
      console.log("Handled /summon");
      return;
    }

    if (commentBody.startsWith("/oracle")) {
      const actorId = "scribe-bot";
      const q = commentBody.replace("/oracle", "").trim();
      const reply = `${getActorLabel(actorId)} รับคำถามแล้ว -> "${q || "(ไม่มีคำถาม)"}"`;

      await postComment({
        owner,
        repo,
        issueNumber,
        actorId,
        body: reply,
        dedupeKey: dedupeKeyFor(actorId, "oracle"),
      });
      console.log("Handled /oracle");
      return;
    }

    if (commentBody.startsWith("/silence")) {
      const actorId = "jin-core";
      const reply = `${getActorLabel(actorId)} 🔕 โหมดเงียบถูกเปิดสำหรับเธรดนี้ (mock)`;

      await postComment({
        owner,
        repo,
        issueNumber,
        actorId,
        body: reply,
        dedupeKey: dedupeKeyFor(actorId, "silence"),
      });
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
          body: ritualTemplate(actorId, topic),
          dedupeKey: dedupeKeyFor(actorId, `ritual-${actorId}`),
        })
      );

      const results = await Promise.all(parallelRuns);

      const summaryActor = "jin-core";
      const links = results
        .map((r, i) => {
          if (!r?.data?.html_url) {
            return `- ${getActorLabel(ritualBots[i])}: (skip duplicate)`;
          }
          return `- ${getActorLabel(ritualBots[i])}: ${r.data.html_url}`;
        })
        .join("\n");

      const summary = `${getActorLabel(summaryActor)} ✅ เปิดพิธีแบบขนานแล้ว\n\nหัวข้อ: **${topic || "(ยังไม่ระบุ)"}**\n\nเธรดย่อยที่สร้างอัตโนมัติ:\n${links}\n\nคำสั่งถัดไปแนะนำ: ใช้ /council vote <proposal> หลังจากอ่านครบ 3 เธรด`;

      await postComment({
        owner,
        repo,
        issueNumber,
        actorId: summaryActor,
        body: summary,
        dedupeKey: dedupeKeyFor(summaryActor, "ritual-summary"),
      });
      console.log("Handled /ritual in parallel");
      return;
    }

    // Unknown command fallback
    const actorId = "jin-core";
    const fallback =
      "🔮 [Jin] รับรู้พิธีแล้ว แต่ยังไม่พบคำสั่งที่รองรับ";
    await postComment({
      owner,
      repo,
      issueNumber,
      actorId,
      body: fallback,
      dedupeKey: dedupeKeyFor(actorId, "unknown-command"),
    });
    return;
  }

  // ── 2) Mention router (new) ──
  const handled = await handleMentionRoute({
    owner,
    repo,
    issueNumber,
    commentBody,
    commentAuthor,
    manifest,
    dedupeKeyFor,
  });

  if (handled) {
    console.log("Handled via mention router.");
    return;
  }

  // ── 3) No command, no mention → exit quietly ──
  console.log("No command or mention found. Exiting.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
