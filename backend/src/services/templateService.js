const Handlebars = require('handlebars');

function renderTemplate(html, data) {
  const template = Handlebars.compile(html || '');
  return template(data || {});
}

module.exports = {
  renderTemplate,
};
