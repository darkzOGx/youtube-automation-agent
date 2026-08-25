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
  if (secret === undefined || secret === '') return null;
  if (secret.length < 16) {
    // A present-but-invalid key means the operator tried to enable encryption.
    // Failing open to plaintext here would silently defeat that intent, so
    // treat it as a configuration error instead.
    throw new Error(
      'CREDENTIAL_KEY is set but shorter than 16 characters. Refusing to ' +
      'handle secrets: use a key of at least 16 characters, or unset ' +
      'CREDENTIAL_KEY to fall back to unencrypted 0600 storage.'
    );
  }
  return secret;
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

/**
 * Write via a 0600 temp file in the same directory, then rename over the
 * target. `writeFile(..., { mode })` only applies the mode when it CREATES a
 * file; replacing an existing world-readable file in place would leave the old
 * permissive mode on fresh secrets (and a crash before a follow-up chmod
 * would leave them exposed). The rename swaps in an inode that was private
 * from birth.
 */
function writeFileAtomicSync(filePath, contents) {
  const tmp = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, contents, { mode: 0o600 });
  try {
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
}

async function writeFileAtomic(filePath, contents) {
  const tmp = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, contents, { mode: 0o600 });
  try {
    await fsp.rename(tmp, filePath);
  } catch (err) {
    try { await fsp.unlink(tmp); } catch { /* already gone */ }
    throw err;
  }
}

/** Synchronous write (used by the standalone OAuth scripts). */
function writeJsonSecureSync(filePath, obj, logger) {
  const plaintext = JSON.stringify(obj, null, 2);
  const secret = getKeyMaterial();
  const contents = secret ? encryptToEnvelope(plaintext, secret) : plaintext;
  if (!secret) {
    warnOnce(logger, 'CREDENTIAL_KEY not set — secrets are stored unencrypted (0600). Set CREDENTIAL_KEY to encrypt at rest.');
  }
  writeFileAtomicSync(filePath, contents);
}

/** Async write (used by the credential manager). */
async function writeJsonSecure(filePath, obj, logger) {
  const plaintext = JSON.stringify(obj, null, 2);
  const secret = getKeyMaterial();
  const contents = secret ? encryptToEnvelope(plaintext, secret) : plaintext;
  if (!secret) {
    warnOnce(logger, 'CREDENTIAL_KEY not set — secrets are stored unencrypted (0600). Set CREDENTIAL_KEY to encrypt at rest.');
  }
  await writeFileAtomic(filePath, contents);
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
