const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { resolveSenderIdentity, resolveDisplayName } = require('./services/senderResolver');
require('dotenv').config();

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const TOKEN_PATH = path.join(dataDir, 'tokens.json');

/* ── persistent state read/write ── */

function readAuthState() {
  try {
    const raw = fs.readFileSync(TOKEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeAuthState(state) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(state, null, 2));
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback';
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function loadTokens() {
  const state = readAuthState();
  if (!state) return null;
  if (state.tokens) return state.tokens;
  // backward compatibility: flat token object (legacy format)
  if (state.access_token || state.refresh_token) return state;
  return null;
}

function loadSenderIdentity() {
  const state = readAuthState();
  return state?.identity || null;
}

function saveTokens(tokens) {
  const existing = readAuthState() || {};
  // always store under .tokens — strip legacy flat keys
  const { access_token, refresh_token, scope, token_type, expiry_date, refresh_token_expires_in, ...rest } = existing;
  const nextState = { ...rest, tokens };
  writeAuthState(nextState);
}

function saveSenderIdentity(identity) {
  const existing = readAuthState() || {};
  const nextState = { ...existing, identity };
  writeAuthState(nextState);
}

function clearAuth() {
  try { fs.unlinkSync(TOKEN_PATH); } catch { /* already gone */ }
  console.log('[gmail] Auth state cleared — tokens removed');
}

/* ── quick auth checks ── */

function hasTokens() {
  return !!loadTokens();
}

function getSenderProfile() {
  return loadSenderIdentity();
}

/**
 * Verify stored tokens by calling sendAs.list (works with gmail.settings.basic scope).
 * Returns { valid, email, displayName } — if tokens are dead, auto-clears them.
 */
async function verifyAuth() {
  const tokens = loadTokens();
  if (!tokens) return { valid: false };

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials(tokens);

  // persist any refreshed tokens
  oAuth2Client.on('tokens', (newTokens) => {
    const current = loadTokens() || {};
    saveTokens({ ...current, ...newTokens });
    console.log('[gmail] Token refreshed and saved');
  });

  try {
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
    // Use sendAs.list — it only needs gmail.settings.basic which we already request
    const res = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const sendAsList = res?.data?.sendAs || [];
    const primary = sendAsList.find(sa => sa.isPrimary) || sendAsList[0];
    const email = primary?.sendAsEmail || '';
    const displayName = primary?.displayName || '';

    // Cache identity if we got it
    if (email) {
      saveSenderIdentity({
        sendAsEmail: email,
        gmailDisplayName: displayName,
        fetchedAt: new Date().toISOString(),
      });
    }

    return { valid: true, email, displayName };
  } catch (err) {
    const errBody = err?.response?.data?.error;
    const errMsg = errBody?.message || err.message || '';
    const errStatus = errBody?.status || '';
    console.error('[gmail] Token verification failed:', errMsg);

    // Only clear tokens for actual auth failures, not scope/permission issues
    if (/invalid_grant|invalid_client|Token has been expired|revoked/i.test(errMsg)) {
      clearAuth();
      return { valid: false, error: errMsg };
    }

    // For other errors (network, transient), don't nuke tokens — just report
    return { valid: false, error: errMsg };
  }
}

/* ── auth flow ── */

function getAuthUrl() {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.settings.basic',
    ],
    prompt: 'consent',
  });
}

async function handleAuthCode(code) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  saveTokens(tokens);

  // Fetch and cache primary send-as identity right after auth
  try {
    const identity = await resolveSenderIdentity({
      auth: oAuth2Client,
      getCachedIdentity: () => null, // force fresh fetch
      saveIdentity: saveSenderIdentity,
    });
    saveSenderIdentity({
      sendAsEmail: identity.sendAsEmail,
      gmailDisplayName: identity.gmailDisplayName,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to fetch sender identity after auth:', err.message);
  }

  return tokens;
}

/* ── authorized client ── */

function getAuthorizedClient() {
  const oAuth2Client = getOAuthClient();
  const tokens = loadTokens();
  if (!tokens) {
    const err = new Error('Not authorized with Google. Please reconnect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }
  oAuth2Client.setCredentials(tokens);
  oAuth2Client.on('tokens', (newTokens) => {
    const current = loadTokens() || {};
    saveTokens({ ...current, ...newTokens });
    console.log('[gmail] Token auto-refreshed and saved');
  });
  return oAuth2Client;
}

/* ── email sending ── */

function toBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendMimeEmail({ to, subject, html, senderName }) {
  let auth;
  try {
    auth = getAuthorizedClient();
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') clearAuth();
    throw err;
  }

  const gmail = google.gmail({ version: 'v1', auth });

  let identity;
  try {
    identity = await resolveSenderIdentity({
      auth,
      customSenderName: senderName,
      getCachedIdentity: loadSenderIdentity,
      saveIdentity: saveSenderIdentity,
    });
  } catch (err) {
    // If identity fetch fails due to auth, clear and rethrow
    if (/invalid_grant|Token has been expired|revoked/i.test(err.message || '')) {
      clearAuth();
      const authErr = new Error('Gmail authorization expired. Please reconnect your account.');
      authErr.code = 'AUTH_EXPIRED';
      throw authErr;
    }
    throw err;
  }

  if (!identity?.sendAsEmail) {
    throw new Error('Sender identity could not be resolved');
  }

  const displayName = resolveDisplayName(
    senderName,
    identity.gmailDisplayName,
    identity.sendAsEmail
  );

  const toHeader = Array.isArray(to) ? to.join(', ') : to;
  const messageParts = [
    `From: ${displayName} <${identity.sendAsEmail}>`,
    `To: ${toHeader}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
  ];

  const message = messageParts.join('\r\n');
  const encodedMessage = toBase64Url(message);

  try {
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });
    console.log(`[gmail] Sent to ${toHeader}, messageId: ${result.data?.id}`);
  } catch (err) {
    // Handle auth errors during actual send
    const errMsg = err?.response?.data?.error?.message || err.message || '';
    if (/invalid_grant|Token has been expired|revoked/i.test(errMsg)) {
      clearAuth();
      const authErr = new Error('Gmail authorization expired. Please reconnect your account.');
      authErr.code = 'AUTH_EXPIRED';
      throw authErr;
    }
    throw err;
  }
}

module.exports = {
  getAuthUrl,
  handleAuthCode,
  hasTokens,
  verifyAuth,
  clearAuth,
  getSenderProfile,
  getAuthorizedClient,
  loadSenderIdentity,
  saveSenderIdentity,
  sendMimeEmail,
};
