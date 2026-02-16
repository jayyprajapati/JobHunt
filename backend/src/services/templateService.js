const Handlebars = require('handlebars');

const SUPPORTED_VARS = ['name', 'company'];

function normalizeVariables(html) {
  if (!html) return '';
  return html.replace(/(\{\{+)(\s*[#/>]?)(\s*[^}\s]+)(\s*\}+)/g, (match, open, prefix, token, close) => {
    const core = (token || '').trim().toLowerCase();
    if (!SUPPORTED_VARS.includes(core)) return match;
    const cleanedPrefix = prefix ? prefix.trim() : '';
    const normalizedToken = cleanedPrefix ? `${cleanedPrefix} ${core}` : core;
    return `${open}${normalizedToken}${close}`;
  });
}

function toLowerData(data) {
  const result = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    result[String(key).toLowerCase()] = value;
  });
  return result;
}

function renderTemplate(html, data) {
  const normalized = normalizeVariables(html || '');
  const template = Handlebars.compile(normalized);
  return template(toLowerData(data));
}

module.exports = {
  renderTemplate,
  normalizeVariables,
};
