#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

function parseArgs(argv) {
  const out = {
    stateFile: ".state/jin-loop-last.json",
    cooldownMin: 8,
    candidates: [],
    work: "",
    changed: "",
    why: "",
    next: "",
    blocker: "",
    commit: "",
    branch: "",
    link: "",
    preflightJson: ".state/jin-loop-preflight.json",
    pushProofJson: ".state/jin-loop-push-proof.json",
    reportFile: ".state/jin-loop-report-th.txt",
    maxLineChars: 180,
    repo: "",
    issue: "",
    post: false,
    allowUnverifiedPost: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--state") out.stateFile = argv[++i];
    else if (a === "--cooldown-min") out.cooldownMin = Number(argv[++i]);
    else if (a === "--candidate") out.candidates.push(argv[++i]);
    else if (a === "--work") out.work = argv[++i] ?? "";
    else if (a === "--changed") out.changed = argv[++i] ?? "";
    else if (a === "--why") out.why = argv[++i] ?? "";
    else if (a === "--next") out.next = argv[++i] ?? "";
    else if (a === "--blocker") out.blocker = argv[++i] ?? "";
    else if (a === "--commit") out.commit = argv[++i] ?? "";
    else if (a === "--branch") out.branch = argv[++i] ?? "";
    else if (a === "--link") out.link = argv[++i] ?? "";
    else if (a === "--preflight-json") out.preflightJson = argv[++i] ?? "";
    else if (a === "--push-proof-json") out.pushProofJson = argv[++i] ?? "";
    else if (a === "--report-file") out.reportFile = argv[++i] ?? "";
    else if (a === "--max-line-chars") out.maxLineChars = Number(argv[++i] ?? "180");
    else if (a === "--repo") out.repo = argv[++i] ?? "";
    else if (a === "--issue") out.issue = argv[++i] ?? "";
    else if (a === "--post") out.post = true;
    else if (a === "--allow-unverified-post") out.allowUnverifiedPost = true;
    else if (a === "-h" || a === "--help") {
      console.log(`Usage: node scripts/jin-loop-run.mjs [options]\n\nPhase-2 one-command loop:\n  preflight -> work -> push-proof -> report-th -> validator -> optional issue post\n\nRequired (choose one mode):\n  normal:  --changed <text> --why <text> --next <text>\n  blocker: --blocker <text>\n\nOptions:\n  --candidate <file>      Candidate file for anti-repeat preflight (repeatable)\n  --work <cmd>            Shell command for the work step\n  --blocker <text>        Blocker mode (emit 4-line blocker report without claiming progress)\n  --state <path>          State file (default: .state/jin-loop-last.json)\n  --cooldown-min <n>      Preflight cooldown (default: 8)\n  --commit <sha>          Expected commit (default: current HEAD)\n  --branch <name>         Expected branch (default: current branch)\n  --link <url>            Evidence link (default: infer from origin + HEAD)\n  --preflight-json <path> Save preflight JSON (default: .state/jin-loop-preflight.json)\n  --push-proof-json <path> Save push-proof JSON (default: .state/jin-loop-push-proof.json)\n  --report-file <path>    Save Thai report output (default: .state/jin-loop-report-th.txt)\n  --max-line-chars <n>    Max chars per report line (default: 180)\n  --repo <owner/repo>     Repo for gh issue comment\n  --issue <number>        Issue number for gh issue comment (must be canonical #3 when --post)\n  --post                  Post report to issue when --repo/--issue are provided\n  --allow-unverified-post Allow posting even when push-proof fails (default: block post)\n`);
      process.exit(0);
    }
  }

  const hasNormal = Boolean(out.changed && out.why && out.next);
  const hasBlocker = Boolean(out.blocker);

  if (!hasNormal && !hasBlocker) {
    console.error("Missing required fields: use normal mode (--changed --why --next) or blocker mode (--blocker)");
    process.exit(2);
  }

  if (hasNormal && hasBlocker) {
    console.error("Use either normal mode or blocker mode, not both");
    process.exit(2);
  }

  return out;
}

function ensureDirFor(filePath) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function runNode(script, args = [], { allowFailure = false } = {}) {
  const proc = spawnSync("node", [script, ...args], { encoding: "utf8" });
  if (!allowFailure && proc.status !== 0) {
    if (proc.stdout) process.stdout.write(proc.stdout);
    if (proc.stderr) process.stderr.write(proc.stderr);
    process.exit(proc.status || 1);
  }
  return proc;
}

function runShell(cmd) {
  const proc = spawnSync("bash", ["-lc", cmd], {
    stdio: "inherit",
    encoding: "utf8",
  });
  if (proc.status !== 0) process.exit(proc.status || 1);
}

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
}

function inferCommitLink(fullSha) {
  try {
    const remote = git("config --get remote.origin.url");
    let base = "";

    if (remote.startsWith("git@github.com:")) {
      base = remote.replace("git@github.com:", "https://github.com/");
    } else if (remote.startsWith("https://github.com/")) {
      base = remote;
    }

    if (!base) return "";
    base = base.replace(/\.git$/, "");
    return `${base}/commit/${fullSha}`;
  } catch {
    return "";
  }
}

function writeMaybeJson(pathname, text, fallbackObj) {
  ensureDirFor(pathname);
  if (text && text.trim()) {
    fs.writeFileSync(pathname, text.trim() + "\n");
    return;
  }
  fs.writeFileSync(pathname, JSON.stringify(fallbackObj, null, 2) + "\n");
}

function updateLoopState(stateFile, files, commit, nextHint) {
  ensureDirFor(stateFile);

  let prev = {
    lastRunAt: null,
    lastTouchedFiles: [],
    lastCommit: null,
    nextHint: null,
  };

  if (fs.existsSync(stateFile)) {
    try {
      prev = { ...prev, ...JSON.parse(fs.readFileSync(stateFile, "utf8")) };
    } catch {
      // Keep safe defaults when state file is corrupted.
    }
  }

  const touched = Array.from(new Set((files || []).map((x) => String(x || "").trim()).filter(Boolean)));
  const nextState = {
    ...prev,
    lastRunAt: new Date().toISOString(),
    lastTouchedFiles: touched,
    lastCommit: commit || null,
    nextHint: nextHint || null,
  };

  fs.writeFileSync(stateFile, JSON.stringify(nextState, null, 2) + "\n");
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  const canonicalIssue = "3";

  ensureDirFor(opt.preflightJson);
  ensureDirFor(opt.pushProofJson);
  ensureDirFor(opt.reportFile);

  const isBlockerMode = Boolean(opt.blocker);

  const preflightArgs = [
    "--state",
    opt.stateFile,
    "--cooldown-min",
    String(opt.cooldownMin),
    "--json",
  ];
  for (const c of opt.candidates) preflightArgs.push("--candidate", c);

  const preflight = runNode("scripts/jin-loop-preflight.mjs", preflightArgs, {
    allowFailure: true,
  });

  writeMaybeJson(opt.preflightJson, preflight.stdout, {
    ok: false,
    reasons: ["preflight script produced no JSON output"],
  });

  if (preflight.status !== 0 && !isBlockerMode) {
    const msg = preflight.stderr?.trim() || "preflight blocked";
    console.error(`Preflight blocked: ${msg}`);
    process.exit(preflight.status || 1);
  }

  if (opt.work && !isBlockerMode) runShell(opt.work);

  const headShort = opt.commit || git("rev-parse --short HEAD");
  const headFull = git("rev-parse HEAD");
  const branch = opt.branch || git("branch --show-current") || "main";
  const link = opt.link || inferCommitLink(headFull);

  let pushProofVerified = false;
  if (!isBlockerMode) {
    const pushProofArgs = ["--commit", headShort, "--branch", branch, "--json"];
    const pushProof = runNode("scripts/jin-loop-push-proof.mjs", pushProofArgs, {
      allowFailure: true,
    });
    pushProofVerified = pushProof.status === 0;

    writeMaybeJson(opt.pushProofJson, pushProof.stdout, {
      ok: false,
      status: "push-proof-unavailable",
      checks: [],
    });
  } else {
    writeMaybeJson(opt.pushProofJson, "", {
      ok: false,
      status: "blocker-mode-no-push-proof",
      checks: [],
    });
  }

  const reportArgs = isBlockerMode
    ? [
        "--blocker",
        opt.blocker,
        "--preflight-json",
        opt.preflightJson,
        "--push-proof-json",
        opt.pushProofJson,
        "--max-line-chars",
        String(opt.maxLineChars),
      ]
    : [
        "--changed",
        opt.changed,
        "--why",
        opt.why,
        "--next",
        opt.next,
        "--commit",
        headShort,
        "--preflight-json",
        opt.preflightJson,
        "--push-proof-json",
        opt.pushProofJson,
        "--max-line-chars",
        String(opt.maxLineChars),
      ];

  if (link) reportArgs.push("--link", link);

  const report = runNode("scripts/jin-loop-report-th.mjs", reportArgs);
  const reportText = (report.stdout || "").trim();
  fs.writeFileSync(opt.reportFile, reportText + "\n");

  const validateArgs = [
    "--file",
    opt.reportFile,
    "--max-line-chars",
    String(opt.maxLineChars),
    "--require-board",
    canonicalIssue,
    "--require-numbered",
  ];
  if (!isBlockerMode) validateArgs.push("--require-line1-path");
  runNode("scripts/jin-loop-validate-th-report.mjs", validateArgs);

  if (opt.post) {
    if (!opt.repo || !opt.issue) {
      console.error("--post requires --repo and --issue");
      process.exit(2);
    }
    if (String(opt.issue) !== canonicalIssue) {
      console.error(`Canonical board lock: expected issue #${canonicalIssue}, got #${opt.issue}`);
      process.exit(2);
    }
    if (!pushProofVerified && !opt.allowUnverifiedPost) {
      console.error(
        "Refuse to post: push-proof not verified. Re-run after push, or pass --allow-unverified-post to post blocker/local-only status intentionally."
      );
      process.exit(2);
    }
    runShell(`gh issue comment ${opt.issue} --repo ${opt.repo} --body-file ${opt.reportFile}`);
  }

  if (isBlockerMode) {
    // In blocker mode, avoid marking candidate files as "touched" to prevent
    // anti-repeat guardrails from blocking the next real run.
    updateLoopState(opt.stateFile, [], null, `blocker: ${String(opt.blocker || "blocked").trim()}`);
  } else {
    updateLoopState(opt.stateFile, opt.candidates, headShort, opt.next);
  }
  console.log(reportText);
}

main();
