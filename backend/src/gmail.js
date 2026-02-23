const { google } = require('googleapis');
const { resolveSenderIdentity, resolveDisplayName } = require('./services/senderResolver');
const { User } = require('./db');
const { encrypt, decrypt } = require('./utils/crypto');
require('dotenv').config();

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback';
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl({ state, prompt = 'consent' }) {
  const oAuth2Client = getOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt,
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
    ],
    state,
  });
}

async function exchangeCodeForUser(user, code) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  const incomingRefresh = tokens?.refresh_token;
  if (!incomingRefresh && !user.encryptedRefreshToken) {
    throw new Error('No refresh token returned. Please remove app access in Google and try again.');
  }
  const refreshToken = incomingRefresh || decrypt(user.encryptedRefreshToken);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
  const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
  if (!profile?.emailAddress) {
    throw new Error('Failed to read Gmail profile');
  }

  const encryptedRefreshToken = incomingRefresh ? encrypt(incomingRefresh) : user.encryptedRefreshToken;

  user.googleId = profile.emailAddress;
  user.gmailEmail = profile.emailAddress.toLowerCase();
  user.email = user.email || profile.emailAddress.toLowerCase();
  user.displayName = user.displayName || profile.emailAddress;
  user.encryptedRefreshToken = encryptedRefreshToken;
  user.gmailConnected = true;
  await user.save();

  return user;
}

async function getAuthorizedClient(user) {
  if (!user || !user.encryptedRefreshToken) {
    const err = new Error('Missing Gmail authorization. Please reconnect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const refreshToken = decrypt(user.encryptedRefreshToken);
  if (!refreshToken) {
    const err = new Error('Missing Gmail authorization. Please reconnect your Gmail account.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

async function verifyAuth(user) {
  try {
    if (!user) return { valid: false };
    const auth = await getAuthorizedClient(user);
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.getProfile({ userId: 'me' });
    const primaryEmail = res?.data?.emailAddress || user.email;
    return {
      valid: !!primaryEmail,
      email: primaryEmail,
      displayName: user.displayName,
    };
  } catch (err) {
    const errMsg = err?.response?.data?.error?.message || err.message || '';
    return { valid: false, error: errMsg };
  }
}

function toBase64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendMimeEmail({ user, to, subject, html, senderName }) {
  const auth = await getAuthorizedClient(user);
  const gmail = google.gmail({ version: 'v1', auth });

  const identity = await resolveSenderIdentity({
    auth,
    customSenderName: senderName,
    getCachedIdentity: null,
    saveIdentity: null,
  });

  if (!identity?.sendAsEmail) {
    const err = new Error('Sender identity could not be resolved');
    err.code = 'SENDER_UNAVAILABLE';
    throw err;
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
    const errMsg = err?.response?.data?.error?.message || err.message || '';
    if (/invalid_grant|Token has been expired|revoked/i.test(errMsg)) {
      const authErr = new Error('Gmail authorization expired. Please reconnect your account.');
      authErr.code = 'AUTH_EXPIRED';
      throw authErr;
    }
    throw err;
  }
}

module.exports = {
  getAuthUrl,
  exchangeCodeForUser,
  verifyAuth,
  getAuthorizedClient,
  sendMimeEmail,
};
