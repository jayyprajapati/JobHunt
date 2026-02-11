const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const TOKEN_PATH = path.join(dataDir, 'tokens.json');

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
  try {
    const raw = fs.readFileSync(TOKEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function isAuthenticated() {
  return !!loadTokens();
}

function getAuthUrl() {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
    prompt: 'consent',
  });
}

async function handleAuthCode(code) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  saveTokens(tokens);
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

async function sendMimeEmail({ to, subject, html }) {
  const auth = getAuthorizedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const messageParts = [
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    html,
  ];

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

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
  sendMimeEmail,
};
