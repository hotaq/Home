#!/usr/bin/env node
import fs from "node:fs";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);

function parseArgs(argv) {
  const out = {
    stateFile: ".state/jin-loop-last.json",
    cooldownMin: 8,
    candidates: [],
    scopePrefixes: [],
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--state") out.stateFile = argv[++i];
    else if (a === "--cooldown-min") out.cooldownMin = Number(argv[++i]);
    else if (a === "--candidate") out.candidates.push(argv[++i]);
    else if (a === "--scope-prefix") out.scopePrefixes.push(String(argv[++i] ?? "").trim());
    else if (a === "--json") out.json = true;
    else if (a === "-h" || a === "--help") {
      console.log(`Usage: node scripts/jin-loop-preflight.mjs [options]\n\nOptions:\n  --state <path>         State file path (default: .state/jin-loop-last.json)\n  --cooldown-min <n>     Minimum minutes between runs (default: 8)\n  --candidate <file>     Candidate file to touch (repeatable)\n  --scope-prefix <path>  Allowed path prefix for candidates (repeatable)\n  --json                 Output machine-readable JSON\n`);
      process.exit(0);
    }
  }

  return out;
}

function loadState(path) {
  if (!fs.existsSync(path)) {
    return {
      lastRunAt: null,
      lastTouchedFiles: [],
      lastCommit: null,
      nextHint: null,
    };
  }

  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return {
      lastRunAt: null,
      lastTouchedFiles: [],
      lastCommit: null,
      nextHint: null,
      _parseError: true,
    };
  }
}

function minutesSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 60000;
}

function getDirtyFiles() {
  try {
    const out = execSync("git status --porcelain", { encoding: "utf8" }).trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => line.replace(/^..\s?/, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function run() {
  const opt = parseArgs(args);
  const state = loadState(opt.stateFile);
  const mins = minutesSince(state.lastRunAt);

  const reasons = [];
  const warnings = [];
  const dirtyFiles = getDirtyFiles();

  if (state._parseError) warnings.push("state file parse failed; using safe defaults");
  if (dirtyFiles.length > 0) {
    warnings.push(
      `workspace already dirty (${dirtyFiles.length} file(s)); stage only target files for this run`
    );
  }

  if (mins < opt.cooldownMin) {
    reasons.push(
      `cooldown active: last run ${mins.toFixed(1)} min ago (< ${opt.cooldownMin} min)`
    );
  }

  if (opt.candidates.length === 0) {
    reasons.push("no candidate files provided; anti-repeat guardrail cannot verify this run");
  }

  const scopePrefixes = opt.scopePrefixes
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((x) => x.replace(/\\+$/g, "").replace(/\/$/, ""));
  const outOfScope =
    scopePrefixes.length === 0
      ? []
      : opt.candidates.filter(
          (c) => !scopePrefixes.some((prefix) => c === prefix || c.startsWith(`${prefix}/`))
        );
  if (outOfScope.length > 0) {
    reasons.push(
      `candidate out of allowed scope: ${outOfScope.join(", ")} (allowed: ${scopePrefixes.join(", ")})`
    );
  }

  const repeated = opt.candidates.filter((c) =>
    Array.isArray(state.lastTouchedFiles) ? state.lastTouchedFiles.includes(c) : false
  );
  if (repeated.length > 0) {
    warnings.push(`candidate repeats last touched file(s): ${repeated.join(", ")}`);

    // Hard guardrail for continuous loops:
    // if every provided candidate repeats the immediate previous run,
    // block this run to prevent no-op churn.
    if (opt.candidates.length > 0 && repeated.length === opt.candidates.length) {
      reasons.push(
        "all candidates repeat last touched files; choose a different primary file for this run"
      );
    }
  }

  const ok = reasons.length === 0;
  const summary = {
    ok,
    stateFile: opt.stateFile,
    cooldownMin: opt.cooldownMin,
    lastRunAt: state.lastRunAt ?? null,
    minutesSinceLastRun: Number.isFinite(mins) ? Number(mins.toFixed(2)) : null,
    lastTouchedFiles: Array.isArray(state.lastTouchedFiles) ? state.lastTouchedFiles : [],
    nextHint: typeof state.nextHint === "string" ? state.nextHint : null,
    dirtyWorkspace: dirtyFiles.length > 0,
    dirtyFiles,
    allowedScopePrefixes: scopePrefixes,
    outOfScopeCandidates: outOfScope,
    warnings,
    reasons,
    nextAction: ok
      ? dirtyFiles.length > 0
        ? "Proceed, but stage only target file(s) to avoid bundling unrelated diffs."
        : "Proceed with one scoped improvement task."
      : "Skip this run and retry after cooldown.",
  };

  if (opt.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Preflight: ${ok ? "OK" : "BLOCKED"}`);
    if (summary.lastRunAt) {
      console.log(`- lastRunAt: ${summary.lastRunAt} (${summary.minutesSinceLastRun} min ago)`);
    } else {
      console.log("- lastRunAt: none");
    }
    if (summary.lastTouchedFiles.length) {
      console.log(`- lastTouchedFiles: ${summary.lastTouchedFiles.join(", ")}`);
    }
    if (summary.nextHint) {
      console.log(`- nextHint: ${summary.nextHint}`);
    }
    if (summary.dirtyWorkspace) {
      console.log(`- dirtyFiles: ${summary.dirtyFiles.join(", ")}`);
    }
    if (summary.allowedScopePrefixes.length > 0) {
      console.log(`- allowedScopePrefixes: ${summary.allowedScopePrefixes.join(", ")}`);
    }
    if (summary.outOfScopeCandidates.length > 0) {
      console.log(`- outOfScopeCandidates: ${summary.outOfScopeCandidates.join(", ")}`);
    }
    for (const w of warnings) console.log(`- warning: ${w}`);
    for (const r of reasons) console.log(`- reason: ${r}`);
    console.log(`- next: ${summary.nextAction}`);
  }

  if (!ok) process.exit(1);
}

run();
