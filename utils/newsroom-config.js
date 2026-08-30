const fs = require('fs');
const path = require('path');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function integerEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function booleanEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}

function loadNewsroomConfig() {
  const sourcesPath = path.join(__dirname, '..', 'config', 'news-sources.json');
  const channelPath = path.join(__dirname, '..', 'config', 'newsroom-channel.json');
  const registry = readJson(sourcesPath, { sources: [], companies: [], mediaDomains: [], aiKeywords: [] });
  const channel = readJson(channelPath, {});
  return {
    enabled: booleanEnv('NEWSROOM_ENABLED', false),
    scanIntervalMinutes: integerEnv('NEWSROOM_SCAN_INTERVAL_MINUTES', 30, 5, 24 * 60),
    maxSignalsPerScan: integerEnv('NEWSROOM_MAX_SIGNALS_PER_SCAN', 100, 1, 500),
    breakingThreshold: integerEnv('NEWSROOM_BREAKING_THRESHOLD', 90, 0, 100),
    aiTodayThreshold: integerEnv('NEWSROOM_AI_TODAY_THRESHOLD', 75, 0, 100),
    standardThreshold: integerEnv('NEWSROOM_STANDARD_THRESHOLD', 60, 0, 100),
    watchlistThreshold: 45,
    autoCreateIdeas: booleanEnv('NEWSROOM_AUTO_CREATE_IDEAS', true),
    requirePrimaryForBreaking: booleanEnv('NEWSROOM_REQUIRE_PRIMARY_FOR_BREAKING', true),
    scoreVersion: 'news-score-v1',
    userAgent: registry.userAgent,
    timeoutMs: registry.timeoutMs || 15000,
    maxCandidatesPerSource: registry.maxCandidatesPerSource || 100,
    aiKeywords: registry.aiKeywords || [],
    companies: registry.companies || [],
    mediaDomains: registry.mediaDomains || [],
    sources: registry.sources || [],
    channel
  };
}

module.exports = { loadNewsroomConfig, integerEnv, booleanEnv };
