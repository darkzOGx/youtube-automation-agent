const fs = require('fs');
const fsp = require('fs').promises;
const crypto = require('crypto');

/**
 * Secure-at-rest JSON store for credentials and OAuth tokens.
 *
 * If CREDENTIAL_KEY (>= 16 chars) is set in the environment, files are encrypted
 * with AES-256-GCM (key derived via scrypt). Otherwise files are written as
 * plaintext but locked down to owner-only permissions (0600) with a warning,
 * so existing setups keep working while no longer being world-readable.
 *
 * The on-disk format for encrypted files is a JSON envelope:
 *   { "v": 1, "alg": "aes-256-gcm", "salt", "iv", "tag", "data" }  (all base64)
 */

const MAGIC = 'aes-256-gcm';

function getKeyMaterial() {
  const secret = process.env.CREDENTIAL_KEY;
  if (secret && secret.length >= 16) return secret;
  return null;
}

function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, 32);
}

function encryptToEnvelope(plaintext, secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: MAGIC,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  });
}

function decryptFromEnvelope(envelope, secret) {
  const obj = JSON.parse(envelope);
  const salt = Buffer.from(obj.salt, 'base64');
  const iv = Buffer.from(obj.iv, 'base64');
  const tag = Buffer.from(obj.tag, 'base64');
  const data = Buffer.from(obj.data, 'base64');
  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function looksEncrypted(raw) {
  try {
    const obj = JSON.parse(raw);
    return obj && obj.alg === MAGIC && obj.data && obj.iv && obj.tag;
  } catch {
    return false;
  }
}

function warnOnce(logger, msg) {
  if (warnOnce._done) return;
  warnOnce._done = true;
  if (logger && typeof logger.warn === 'function') logger.warn(msg);
  else console.warn(msg);
}

/** Synchronous write (used by the standalone OAuth scripts). */
function writeJsonSecureSync(filePath, obj, logger) {
  const plaintext = JSON.stringify(obj, null, 2);
  const secret = getKeyMaterial();
  const contents = secret ? encryptToEnvelope(plaintext, secret) : plaintext;
  if (!secret) {
    warnOnce(logger, 'CREDENTIAL_KEY not set — secrets are stored unencrypted (0600). Set CREDENTIAL_KEY to encrypt at rest.');
  }
  fs.writeFileSync(filePath, contents, { mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch { /* best effort on non-POSIX */ }
}

/** Async write (used by the credential manager). */
async function writeJsonSecure(filePath, obj, logger) {
  const plaintext = JSON.stringify(obj, null, 2);
  const secret = getKeyMaterial();
  const contents = secret ? encryptToEnvelope(plaintext, secret) : plaintext;
  if (!secret) {
    warnOnce(logger, 'CREDENTIAL_KEY not set — secrets are stored unencrypted (0600). Set CREDENTIAL_KEY to encrypt at rest.');
  }
  await fsp.writeFile(filePath, contents, { mode: 0o600 });
  try { await fsp.chmod(filePath, 0o600); } catch { /* best effort on non-POSIX */ }
}

function readJsonSecureSync(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (looksEncrypted(raw)) {
    const secret = getKeyMaterial();
    if (!secret) throw new Error(`${filePath} is encrypted but CREDENTIAL_KEY is not set`);
    return JSON.parse(decryptFromEnvelope(raw, secret));
  }
  return JSON.parse(raw);
}

async function readJsonSecure(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  if (looksEncrypted(raw)) {
    const secret = getKeyMaterial();
    if (!secret) throw new Error(`${filePath} is encrypted but CREDENTIAL_KEY is not set`);
    return JSON.parse(decryptFromEnvelope(raw, secret));
  }
  return JSON.parse(raw);
}

module.exports = {
  writeJsonSecure,
  writeJsonSecureSync,
  readJsonSecure,
  readJsonSecureSync,
  isEncryptionEnabled: () => !!getKeyMaterial(),
};
