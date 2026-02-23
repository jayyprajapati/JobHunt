const crypto = require('crypto');

function getKey() {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error('TOKEN_ENC_KEY env var is required for token encryption');
  }
  let key;
  try {
    key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  } catch (err) {
    throw new Error('TOKEN_ENC_KEY must be hex or base64');
  }
  if (key.length !== 32) {
    throw new Error('TOKEN_ENC_KEY must be 32 bytes (256-bit)');
  }
  return key;
}

function encrypt(value) {
  if (typeof value !== 'string') throw new Error('encrypt expects a string');
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  if (!payload) return '';
  const key = getKey();
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Corrupt encrypted payload');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
