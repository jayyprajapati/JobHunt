const { google } = require('googleapis');

async function fetchPrimarySendAs(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.settings.sendAs.list({ userId: 'me' });
  const sendAs = res?.data?.sendAs || [];
  if (!sendAs.length) {
    throw new Error('No send-as identities found for this Gmail account');
  }
  const primary = sendAs.find(sa => sa.isPrimary) || sendAs[0];
  if (!primary?.sendAsEmail) {
    throw new Error('Primary send-as identity missing email');
  }
  return {
    sendAsEmail: primary.sendAsEmail,
    gmailDisplayName: primary.displayName || '',
  };
}

function resolveDisplayName(customSenderName, gmailDisplayName, sendAsEmail) {
  const custom = (customSenderName || '').trim();
  const gmailName = (gmailDisplayName || '').trim();
  const localPart = (sendAsEmail || '').split('@')[0] || 'Sender';
  return custom || gmailName || localPart;
}

async function resolveSenderIdentity({ auth, customSenderName, getCachedIdentity, saveIdentity }) {
  if (!auth) throw new Error('Missing Gmail auth client');

  const cached = typeof getCachedIdentity === 'function' ? getCachedIdentity() : null;
  let identity = cached && cached.sendAsEmail ? cached : null;

  if (!identity) {
    identity = await fetchPrimarySendAs(auth);
    if (typeof saveIdentity === 'function') {
      saveIdentity({ ...identity, fetchedAt: new Date().toISOString() });
    }
  }

  const resolvedDisplayName = resolveDisplayName(customSenderName, identity.gmailDisplayName, identity.sendAsEmail);

  return {
    ...identity,
    resolvedDisplayName,
  };
}

module.exports = {
  resolveSenderIdentity,
  resolveDisplayName,
  fetchPrimarySendAs,
};
