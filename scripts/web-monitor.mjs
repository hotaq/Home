import fs from 'node:fs';

const targetUrl = process.env.TARGET_URL || "https://hotaq.github.io/Home/";
const owner = process.env.REPO_OWNER || "hotaq";
const repo = process.env.REPO_NAME || "Home";
const issueList = (process.env.ISSUES || "1,3").split(",").map((x) => x.trim()).filter(Boolean);
const monitorIntervalMinutes = Number(process.env.MONITOR_INTERVAL_MIN || 30);

async function timedFetch(url, opts = {}, timeoutMs = 12000) {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const ms = Date.now() - started;
    return { ok: res.ok, status: res.status, ms, res };
  } catch (err) {
    const ms = Date.now() - started;
    return { ok: false, status: 0, ms, error: String(err.message || err) };
  } finally {
    clearTimeout(t);
  }
}

function line(name, value) {
  return `- ${name}: ${value}`;
}

function parseLastSuccessFromExistingReport(outPath) {
  try {
    if (!fs.existsSync(outPath)) return null;
    const existing = fs.readFileSync(outPath, 'utf8');
    const match = existing.match(/^- Last successful check:\s*(.+)$/mi);
    if (!match) return null;

    const value = String(match[1] || '').trim();
    if (!value || value === 'unknown' || value.toLowerCase().startsWith('n/a')) return null;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : new Date(ts).toISOString();
  } catch {
    return null;
  }
}

async function checkSite() {
  const r = await timedFetch(targetUrl);
  if (!r.ok) {
    return { ok: false, detail: `HTTP ${r.status} in ${r.ms}ms${r.error ? ` (${r.error})` : ""}` };
  }

  const html = await r.res.text();
  const hasMarker = html.includes("Merge Cult") || html.includes("Comms MVP");
  return {
    ok: hasMarker,
    detail: `HTTP ${r.status} in ${r.ms}ms${hasMarker ? "" : " (missing page marker)"}`,
  };
}

async function checkIssues() {
  const results = [];
  for (const issue of issueList) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue}`;
    const r = await timedFetch(url, {
      headers: { "Accept": "application/vnd.github+json", "User-Agent": "merge-cult-monitor" },
    });

    if (!r.ok) {
      results.push({ issue, ok: false, detail: `HTTP ${r.status} in ${r.ms}ms${r.error ? ` (${r.error})` : ""}` });
      continue;
    }

    const body = await r.res.json();
    results.push({ issue, ok: true, detail: `${body.state} · ${r.ms}ms` });
  }
  return results;
}

async function main() {
  const outPath = process.env.MONITOR_OUT || "web/monitor-latest.md";

  const site = await checkSite();
  const issues = await checkIssues();
  const issuesOk = issues.every((i) => i.ok);
  const generatedAt = new Date().toISOString();
  const thisRunOk = site.ok && issuesOk;

  const previousLastSuccess = parseLastSuccessFromExistingReport(outPath);
  const lastSuccess = thisRunOk ? generatedAt : (previousLastSuccess || 'unknown');
  const nextRefresh = new Date(Date.now() + monitorIntervalMinutes * 60_000).toISOString();

  const summary = [
    "## Web MVP Monitor",
    line("Target URL", targetUrl),
    line("Generated at", generatedAt),
    line("Last successful check", lastSuccess),
    line("Next refresh (target)", `${nextRefresh} (+${monitorIntervalMinutes}m)`),
    line("Site", site.ok ? `OK (${site.detail})` : `FAIL (${site.detail})`),
    "### GitHub API (issue probes)",
    ...issues.map((i) => line(`#${i.issue}`, i.ok ? `OK (${i.detail})` : `FAIL (${i.detail})`)),
  ].join("\n");

  console.log(summary);
  fs.writeFileSync(outPath, summary + "\n", "utf8");

  if (!thisRunOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
