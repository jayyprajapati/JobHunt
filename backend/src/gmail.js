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

function readAuthState() {
  try {
    const raw = fs.readFileSync(TOKEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
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
  // backward compatibility with previously stored tokens-only object
  if (state.access_token || state.refresh_token) return state;
  return null;
}

function loadSenderIdentity() {
  const state = readAuthState();
  return state?.identity || null;
}

function saveTokens(tokens) {
  const existing = readAuthState() || {};
  const nextState = { ...existing, tokens };
  writeAuthState(nextState);
}

function saveSenderIdentity(identity) {
  const existing = readAuthState() || {};
  const nextState = { ...existing, identity };
  writeAuthState(nextState);
}

function isAuthenticated() {
  return !!loadTokens();
}

function getSenderProfile() {
  return loadSenderIdentity();
}

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
      getCachedIdentity: loadSenderIdentity,
      saveIdentity: saveSenderIdentity,
    });
    saveSenderIdentity({
      sendAsEmail: identity.sendAsEmail,
      gmailDisplayName: identity.gmailDisplayName,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Log but do not block auth completion
    console.warn('Failed to fetch sender identity after auth:', err.message);
  }

  return tokens;
}

function getAuthorizedClient() {
  const oAuth2Client = getOAuthClient();
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('Not authorized with Google. Visit /auth/google');
  }
  oAuth2Client.setCredentials(tokens);
  return oAuth2Client;
}

function toBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendMimeEmail({ to, subject, html, senderName }) {
  const auth = getAuthorizedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const identity = await resolveSenderIdentity({
    auth,
    customSenderName: senderName,
    getCachedIdentity: loadSenderIdentity,
    saveIdentity: saveSenderIdentity,
  });

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

  const message = messageParts.join('\n');
  const encodedMessage = toBase64Url(message);

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });
}

module.exports = {
  getAuthUrl,
  handleAuthCode,
  isAuthenticated,
  getSenderProfile,
  getAuthorizedClient,
  loadSenderIdentity,
  saveSenderIdentity,
  sendMimeEmail,
};
