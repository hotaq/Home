#!/usr/bin/env node
import { execSync } from "node:child_process";

function parseArgs(argv) {
  const out = {
    expectedCommit: null,
    expectedBranch: null,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--commit") out.expectedCommit = argv[++i];
    else if (a === "--branch") out.expectedBranch = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") {
      console.log(`Usage: node scripts/jin-loop-push-proof.mjs [options]\n\nOptions:\n  --commit <sha>    Expected short/long commit SHA\n  --branch <name>   Expected branch name\n  --json            Output JSON\n`);
      process.exit(0);
    }
  }

  return out;
}

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
}

function tryGit(cmd) {
  try {
    return { ok: true, value: git(cmd) };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function run() {
  const opt = parseArgs(process.argv.slice(2));
  const checks = [];

  const head = git("rev-parse --short HEAD");
  const branch = git("branch --show-current");
  const logLine = git("log --oneline --decorate -1");
  const upstreamRef = tryGit("rev-parse --abbrev-ref --symbolic-full-name @{u}");

  checks.push({
    name: "head_commit",
    ok: opt.expectedCommit ? head.startsWith(opt.expectedCommit) : true,
    value: head,
    expected: opt.expectedCommit,
  });

  checks.push({
    name: "branch",
    ok: opt.expectedBranch ? branch === opt.expectedBranch : true,
    value: branch,
    expected: opt.expectedBranch,
  });

  checks.push({
    name: "upstream_configured",
    ok: upstreamRef.ok,
    value: upstreamRef.ok ? upstreamRef.value : "(missing)",
    expected: "upstream branch exists (e.g. origin/main)",
  });

  let ahead = null;
  let behind = null;

  if (upstreamRef.ok) {
    const div = tryGit("rev-list --left-right --count HEAD...@{u}");
    if (div.ok) {
      const [aheadCount, behindCount] = div.value.split(/\s+/).map((n) => Number.parseInt(n, 10));
      ahead = Number.isFinite(aheadCount) ? aheadCount : null;
      behind = Number.isFinite(behindCount) ? behindCount : null;
      checks.push({
        name: "upstream_in_sync",
        ok: ahead === 0 && behind === 0,
        value: { ahead, behind },
        expected: { ahead: 0, behind: 0 },
      });
    } else {
      checks.push({
        name: "upstream_in_sync",
        ok: false,
        value: div.error,
        expected: "able to compare HEAD with upstream",
      });
    }
  }

  const ok = checks.every((c) => c.ok);
  const summary = {
    ok,
    head,
    branch,
    upstream: upstreamRef.ok ? upstreamRef.value : null,
    ahead,
    behind,
    logLine,
    checks,
    status: ok ? "push_verified" : "commit_local_or_push_unverified",
  };

  if (opt.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Push proof: ${ok ? "PASS" : "FAIL"}`);
    console.log(`- HEAD: ${head}`);
    console.log(`- branch: ${branch}`);
    console.log(`- log: ${logLine}`);
    for (const c of checks) {
      if (!c.ok) {
        console.log(`- failed: ${c.name} (expected: ${c.expected ?? "n/a"}, got: ${c.value})`);
      }
    }
  }

  if (!ok) process.exit(1);
}

run();
