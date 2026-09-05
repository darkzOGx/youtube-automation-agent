const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPOSITORY = process.env.GITHUB_REPOSITORY || 'darkzOGx/youtube-automation-agent';
const REPORT_ROOT = path.join(__dirname, '..', '..', 'reports', 'growth');
const now = new Date();
const snapshotDate = now.toISOString().slice(0, 10);

function ghApi(endpoint, { paginate = false, accept } = {}) {
  const args = ['api'];
  if (accept) args.push('-H', `Accept: ${accept}`);
  if (paginate) args.push('--paginate', '--slurp');
  args.push(endpoint);
  const output = execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const parsed = JSON.parse(output);
  return paginate ? parsed.flat() : parsed;
}

function tryGhApi(endpoint, options = {}) {
  try {
    return ghApi(endpoint, options);
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    return { unavailable: true, reason: detail };
  }
}

function percent(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
}

function groupStarsByDay(stargazers, days = 14) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  cutoff.setUTCHours(0, 0, 0, 0);
  const daily = new Map();
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(cutoff);
    date.setUTCDate(cutoff.getUTCDate() + offset);
    daily.set(date.toISOString().slice(0, 10), 0);
  }
  for (const entry of stargazers) {
    const day = entry.starred_at?.slice(0, 10);
    if (daily.has(day)) daily.set(day, daily.get(day) + 1);
  }
  return Array.from(daily, ([date, stars]) => ({ date, stars }));
}

function summarizeTraffic(traffic) {
  if (traffic?.unavailable) return traffic;
  return {
    count: traffic.count,
    uniques: traffic.uniques,
    days: traffic.views || traffic.clones || []
  };
}

function compareFork(repo, fork) {
  const owner = fork.owner?.login;
  const branch = fork.default_branch;
  if (!owner || !branch) return null;
  const comparison = tryGhApi(`repos/${repo.full_name}/compare/${repo.default_branch}...${owner}:${branch}`);
  if (comparison.unavailable) {
    return { owner, fullName: fork.full_name, unavailable: true, reason: comparison.reason };
  }
  return {
    owner,
    fullName: fork.full_name,
    htmlUrl: fork.html_url,
    description: fork.description,
    stars: fork.stargazers_count,
    pushedAt: fork.pushed_at,
    aheadBy: comparison.ahead_by,
    behindBy: comparison.behind_by,
    status: comparison.status,
    changedFiles: comparison.files?.map(file => file.filename) || []
  };
}

function selectForkCandidates(forks) {
  const recentCutoff = new Date(now);
  recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 120);
  return forks
    .filter(fork => !fork.archived && (fork.stargazers_count > 0 || new Date(fork.pushed_at) >= recentCutoff))
    .sort((a, b) => {
      const starDelta = b.stargazers_count - a.stargazers_count;
      return starDelta || new Date(b.pushed_at) - new Date(a.pushed_at);
    })
    .slice(0, 40);
}

function markdownBaseline(snapshot) {
  const lines = [
    `# Lumen growth baseline — ${snapshot.snapshotDate}`,
    '',
    `Captured at ${snapshot.capturedAt}. GitHub traffic and clone figures are rolling aggregates and are not cohort-aligned.`,
    '',
    '## Public repository signals',
    '',
    `- Stars: ${snapshot.repository.stars.toLocaleString()}`,
    `- Forks: ${snapshot.repository.forks.toLocaleString()}`,
    `- Fork-to-star ratio: ${snapshot.repository.forkToStarPercent}%`,
    `- Subscribers: ${snapshot.repository.subscribers.toLocaleString()}`,
    `- Topics: ${snapshot.repository.topics}`,
    `- Last push: ${snapshot.repository.pushedAt}`,
    '',
    '## Rolling GitHub traffic',
    ''
  ];

  if (snapshot.traffic.views.unavailable || snapshot.traffic.clones.unavailable) {
    lines.push(`Traffic unavailable: ${snapshot.traffic.views.reason || snapshot.traffic.clones.reason}`);
  } else {
    lines.push(
      `- Views: ${snapshot.traffic.views.count.toLocaleString()} (${snapshot.traffic.views.uniques.toLocaleString()} unique)`,
      `- Clones: ${snapshot.traffic.clones.count.toLocaleString()} (${snapshot.traffic.clones.uniques.toLocaleString()} unique)`,
      `- Unique-cloner / unique-visitor indicator: ${snapshot.traffic.uniqueCloneVisitorIndicatorPercent}%`,
      '',
      '> This indicator is directional only. GitHub does not expose a cohort-aligned visitor-to-clone conversion rate.',
      '',
      '## Top referrers',
      '',
      '| Referrer | Views | Unique visitors |',
      '| --- | ---: | ---: |'
    );
    for (const referrer of snapshot.traffic.referrers) {
      lines.push(`| ${referrer.referrer} | ${referrer.count.toLocaleString()} | ${referrer.uniques.toLocaleString()} |`);
    }
  }

  lines.push('', '## Stars added by UTC day', '', '| Date | Stars |', '| --- | ---: |');
  for (const day of snapshot.stars.daily) lines.push(`| ${day.date} | ${day.stars} |`);
  lines.push('', 'Generated by `npm run growth:snapshot`.');
  return `${lines.join('\n')}\n`;
}

function markdownForks(census) {
  const lines = [
    `# Lumen public fork census — ${census.snapshotDate}`,
    '',
    `GitHub's repository summary reported ${census.repositoryForkCount.toLocaleString()} forks. The paginated REST census returned ${census.totalForks.toLocaleString()} unique public fork records and compared ${census.comparedCandidates} high-signal candidates with upstream.`,
    '',
    `- Forks with commits ahead of upstream: ${census.aheadForks}`,
    `- Forks with their own stars: ${census.starredForks}`,
    `- Candidates requiring manual product/use-case review: ${census.manualReview.length}`,
    '',
    'The summary count and paginated enumeration can differ while GitHub updates an active fork network. Comparison status can also change as upstream advances. A fork being ahead does not prove deployment or production use.',
    '',
    '## Manual-review queue',
    '',
    '| Fork | Ahead | Stars | Last push | Changed files |',
    '| --- | ---: | ---: | --- | --- |'
  ];
  for (const fork of census.manualReview) {
    const changed = fork.changedFiles.slice(0, 5).join(', ') || 'Not reported';
    lines.push(`| [${fork.fullName}](${fork.htmlUrl}) | ${fork.aheadBy} | ${fork.stars} | ${fork.pushedAt} | ${changed} |`);
  }
  lines.push('', 'Generated from public GitHub metadata by `npm run growth:snapshot`. No private fork data or profile geography is collected.');
  return `${lines.join('\n')}\n`;
}

function writeReport(filePath, contents) {
  if (fs.existsSync(filePath) && process.env.GROWTH_SNAPSHOT_REPLACE !== '1') {
    throw new Error(`Snapshot already exists: ${filePath}. Set GROWTH_SNAPSHOT_REPLACE=1 only to correct the same baseline.`);
  }
  fs.writeFileSync(filePath, contents);
}

function main() {
  const repo = ghApi(`repos/${REPOSITORY}`);
  const views = tryGhApi(`repos/${REPOSITORY}/traffic/views`);
  const clones = tryGhApi(`repos/${REPOSITORY}/traffic/clones`);
  const referrers = tryGhApi(`repos/${REPOSITORY}/traffic/popular/referrers`);
  const stargazers = tryGhApi(`repos/${REPOSITORY}/stargazers?per_page=100`, {
    paginate: true,
    accept: 'application/vnd.github.star+json'
  });
  const forkPages = ghApi(`repos/${REPOSITORY}/forks?per_page=100&sort=oldest`, { paginate: true });
  // Forks can move between result pages while the network is active. De-duplicate
  // the paginated snapshot so a concurrent push/star cannot create repeat rows.
  const forks = Array.from(new Map(forkPages.map(fork => [fork.id, fork])).values());

  const snapshot = {
    schemaVersion: 1,
    snapshotDate,
    capturedAt: now.toISOString(),
    repository: {
      fullName: repo.full_name,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      forkToStarPercent: percent(repo.forks_count, repo.stargazers_count),
      subscribers: repo.subscribers_count,
      topics: repo.topics?.length || 0,
      license: repo.license?.spdx_id || null,
      defaultBranch: repo.default_branch,
      pushedAt: repo.pushed_at
    },
    traffic: {
      views: summarizeTraffic(views),
      clones: summarizeTraffic(clones),
      referrers: referrers.unavailable ? [] : referrers,
      referrersUnavailable: referrers.unavailable ? referrers.reason : null,
      uniqueCloneVisitorIndicatorPercent: views.unavailable || clones.unavailable
        ? null
        : percent(clones.uniques, views.uniques)
    },
    stars: stargazers.unavailable
      ? { unavailable: true, reason: stargazers.reason, daily: [] }
      : { totalTimestamped: stargazers.length, daily: groupStarsByDay(stargazers) }
  };

  const candidates = selectForkCandidates(forks);
  const comparisons = candidates.map(fork => compareFork(repo, fork)).filter(Boolean);
  const useful = comparisons.filter(fork => !fork.unavailable && fork.aheadBy > 0);
  const census = {
    schemaVersion: 1,
    snapshotDate,
    capturedAt: now.toISOString(),
    repository: repo.full_name,
    repositoryForkCount: repo.forks_count,
    totalForks: forks.length,
    comparedCandidates: comparisons.length,
    aheadForks: useful.length,
    starredForks: forks.filter(fork => fork.stargazers_count > 0).length,
    comparisonFailures: comparisons.filter(fork => fork.unavailable),
    manualReview: useful
      .sort((a, b) => b.stars - a.stars || b.aheadBy - a.aheadBy || new Date(b.pushedAt) - new Date(a.pushedAt))
      .slice(0, 25)
  };

  fs.mkdirSync(REPORT_ROOT, { recursive: true });
  writeReport(path.join(REPORT_ROOT, `baseline-${snapshotDate}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
  writeReport(path.join(REPORT_ROOT, `baseline-${snapshotDate}.md`), markdownBaseline(snapshot));
  writeReport(path.join(REPORT_ROOT, `fork-census-${snapshotDate}.json`), `${JSON.stringify(census, null, 2)}\n`);
  writeReport(path.join(REPORT_ROOT, `fork-census-${snapshotDate}.md`), markdownForks(census));
  console.log(`Saved GitHub baseline and fork census to ${REPORT_ROOT}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Growth snapshot failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { groupStarsByDay, percent, selectForkCandidates };
