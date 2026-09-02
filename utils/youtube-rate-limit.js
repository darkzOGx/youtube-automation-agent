const fs = require('fs').promises;
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_STATE_PATH = path.join(ROOT, 'data', 'youtube-rate-limit.json');
const DEFAULT_LOCK_PATH = path.join(ROOT, 'data', '.youtube-rate-limit.lock');
const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 20;
const DEFAULT_LOCK_TIMEOUT_MS = 30000;
const DEFAULT_STALE_LOCK_MS = 60000;

function getDailyLimit(options = {}) {
  const configured = options.limit ?? process.env.YOUTUBE_PUBLIC_SHORTS_PER_DAY;
  const parsed = Number(configured);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(HARD_LIMIT, Math.floor(parsed)));
}

function isExplicitShort(metadata = {}) {
  const candidates = [metadata, metadata.video, metadata.metadata].filter(Boolean);
  return candidates.some(candidate => candidate.isShort === true
    || String(candidate.contentType || '').toLowerCase() === 'short'
    || candidate.aspectRatio === '9:16');
}

function getTimeZone(options = {}) {
  return options.timeZone || process.env.YOUTUBE_RATE_LIMIT_TIMEZONE || 'UTC';
}

function getDateKey(date = new Date(), timeZone = getTimeZone()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getPaths(options = {}) {
  const statePath = path.resolve(options.statePath || DEFAULT_STATE_PATH);
  const lockPath = path.resolve(options.lockPath || DEFAULT_LOCK_PATH);
  return { statePath, lockPath };
}

function emptyState() {
  return { version: 1, days: {} };
}

function normalizeState(state) {
  if (!state || typeof state !== 'object') return emptyState();
  if (!state.days || typeof state.days !== 'object') state.days = {};
  state.version = 1;
  return state;
}

async function readState(statePath) {
  try {
    return normalizeState(JSON.parse(await fs.readFile(statePath, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw new Error(`Could not read YouTube rate-limit state: ${error.message}`);
  }
}

async function writeState(statePath, state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
  try {
    await fs.rename(temporaryPath, statePath);
  } catch {
    await fs.rm(statePath, { force: true }).catch(() => {});
    await fs.rename(temporaryPath, statePath);
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function lockIsStale(lockPath, staleMs) {
  try {
    const stats = await fs.stat(lockPath);
    return Date.now() - stats.mtimeMs > staleMs;
  } catch (error) {
    return error.code !== 'ENOENT';
  }
}

async function acquireLock(lockPath, options = {}) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const timeoutMs = Math.max(1000, Number(options.lockTimeoutMs) || DEFAULT_LOCK_TIMEOUT_MS);
  const staleMs = Math.max(1000, Number(options.staleLockMs) || DEFAULT_STALE_LOCK_MS);
  const startedAt = Date.now();
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ownerPath = path.join(lockPath, 'owner');

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fs.mkdir(lockPath);
      await fs.writeFile(ownerPath, token, 'utf8');
      return async () => {
        try {
          const owner = await fs.readFile(ownerPath, 'utf8');
          if (owner === token) await fs.rm(lockPath, { recursive: true, force: true });
        } catch (error) {
          if (error.code === 'ENOENT') return;
          throw error;
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await lockIsStale(lockPath, staleMs)) {
        await fs.rm(lockPath, { recursive: true, force: true }).catch(() => {});
        continue;
      }
      await sleep(25);
    }
  }

  throw new Error(`Timed out waiting for YouTube rate-limit lock: ${lockPath}`);
}

async function withStateLock(options, operation) {
  const { statePath, lockPath } = getPaths(options);
  const release = await acquireLock(lockPath, options);
  try {
    const state = await readState(statePath);
    const result = await operation(state, statePath);
    return result;
  } finally {
    await release();
  }
}

function getDayRecord(state, dateKey, create = false) {
  if (!state.days[dateKey] && create) state.days[dateKey] = { entries: {} };
  const day = state.days[dateKey];
  if (day && (!day.entries || typeof day.entries !== 'object')) day.entries = {};
  return day;
}

function countDay(day) {
  const entries = Object.values(day?.entries || {});
  const reservations = entries.filter(entry => entry.status === 'reserved').length;
  const uploads = entries.filter(entry => entry.status === 'uploaded').length;
  return {
    reservations,
    uploads,
    count: reservations + uploads
  };
}

function normalizeKey(keyOrOptions, maybeOptions) {
  if (keyOrOptions && typeof keyOrOptions === 'object') {
    const options = { ...keyOrOptions, ...(maybeOptions || {}) };
    return { key: options.key || options.reservationKey, options };
  }
  return { key: keyOrOptions, options: maybeOptions || {} };
}

function assertReservationKey(key) {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('A non-empty reservation key is required');
  }
  return key.trim();
}

async function reservePublicShort(keyOrOptions, maybeOptions) {
  const normalized = normalizeKey(keyOrOptions, maybeOptions);
  const key = assertReservationKey(normalized.key);
  const options = normalized.options;
  const dateKey = getDateKey(options.now || new Date(), getTimeZone(options));
  const limit = getDailyLimit(options);

  return withStateLock(options, async (state, statePath) => {
    const day = getDayRecord(state, dateKey, true);
    const existing = day.entries[key];
    const current = countDay(day);
    if (existing && (existing.status === 'reserved' || existing.status === 'uploaded')) {
      return {
        key,
        dateKey,
        limit,
        count: current.count,
        status: existing.status,
        alreadyReserved: true
      };
    }

    if (current.count >= limit) {
      const error = new Error(`Daily public Short limit reached (${current.count}/${limit}) for ${dateKey}`);
      error.code = 'YOUTUBE_PUBLIC_SHORTS_DAILY_LIMIT';
      error.dateKey = dateKey;
      error.limit = limit;
      error.count = current.count;
      throw error;
    }

    day.entries[key] = {
      status: 'reserved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await writeState(statePath, state);
    return {
      key,
      dateKey,
      limit,
      count: current.count + 1,
      status: 'reserved',
      alreadyReserved: false
    };
  });
}

async function markPublicShortUploaded(keyOrOptions, maybeOptions) {
  const normalized = normalizeKey(keyOrOptions, maybeOptions);
  const key = assertReservationKey(normalized.key);
  const options = normalized.options;
  const dateKey = getDateKey(options.now || new Date(), getTimeZone(options));

  return withStateLock(options, async (state, statePath) => {
    const day = getDayRecord(state, dateKey, true);
    const entry = day.entries[key];
    if (!entry) throw new Error(`No active rate-limit reservation found for ${key}`);
    const alreadyUploaded = entry.status === 'uploaded';
    if (entry.status !== 'uploaded') {
      entry.status = 'uploaded';
      entry.updatedAt = new Date().toISOString();
      await writeState(statePath, state);
    }
    const current = countDay(day);
    return { key, dateKey, status: 'uploaded', count: current.count, alreadyUploaded };
  });
}

async function releasePublicShort(keyOrOptions, maybeOptions) {
  const normalized = normalizeKey(keyOrOptions, maybeOptions);
  const key = assertReservationKey(normalized.key);
  const options = normalized.options;
  const dateKey = getDateKey(options.now || new Date(), getTimeZone(options));

  return withStateLock(options, async (state, statePath) => {
    const day = getDayRecord(state, dateKey, false);
    const entry = day?.entries?.[key];
    if (!entry) return { key, dateKey, released: false, status: null, count: countDay(day).count };
    if (entry.status === 'uploaded') {
      return { key, dateKey, released: false, status: 'uploaded', count: countDay(day).count };
    }

    delete day.entries[key];
    await writeState(statePath, state);
    return { key, dateKey, released: true, status: 'released', count: countDay(day).count };
  });
}

async function getPublicShortStatus(options = {}) {
  const dateKey = getDateKey(options.now || new Date(), getTimeZone(options));
  const limit = getDailyLimit(options);
  return withStateLock(options, async state => {
    const day = getDayRecord(state, dateKey, false);
    const counts = countDay(day);
    return {
      dateKey,
      timeZone: getTimeZone(options),
      limit,
      ...counts,
      entries: Object.entries(day?.entries || {}).map(([key, entry]) => ({ key, ...entry }))
    };
  });
}

async function countPublicShorts(options = {}) {
  const status = await getPublicShortStatus(options);
  return status.count;
}

module.exports = {
  HARD_LIMIT,
  count: countPublicShorts,
  countPublicShorts,
  getDailyLimit,
  getDateKey,
  getPublicShortStatus,
  getStatus: getPublicShortStatus,
  getRateLimitPaths: getPaths,
  isExplicitShort,
  markPublicShortUploaded,
  completePublicShort: markPublicShortUploaded,
  reserve: reservePublicShort,
  reservePublicShort,
  release: releasePublicShort,
  releasePublicShort,
  releaseReservation: releasePublicShort,
  status: getPublicShortStatus
};
