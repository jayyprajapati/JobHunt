const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toTitle(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function extractName(email) {
  const localPart = email.split('@')[0];
  const cleaned = localPart.replace(/[0-9]/g, '');
  const parts = cleaned.split(/[._-]+/).filter(Boolean);
  if (!parts.length) return 'There';
  const name = parts.map(toTitle).join(' ').trim();
  return name.length ? name : 'There';
}

function extractCompany(email) {
  const domain = (email.split('@')[1] || '').split('.')[0] || '';
  if (!domain) return 'Company';
  return toTitle(domain);
}

function parseRecipients(rawInput) {
  if (!rawInput) return [];
  const tokens = rawInput
    .split(/[\n,\s]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const seen = new Set();
  const recipients = [];

  for (const token of tokens) {
    if (!emailRegex.test(token)) continue;
    const email = token.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, name: extractName(email), company: extractCompany(email) });
  }
  return recipients;
}

module.exports = {
  parseRecipients,
  extractName,
  extractCompany,
};
