const express = require('express');
const db = require('../db');
const { renderTemplate } = require('../services/templateService');
const { sendMimeEmail } = require('../gmail');

const router = express.Router();

function fetchCampaign(id) {
  return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
}

function fetchRecipients(campaignId) {
  return db
    .prepare('SELECT * FROM recipients WHERE campaign_id = ? ORDER BY id ASC')
    .all(campaignId);
}

async function sendCampaign(campaignId) {
  const campaign = fetchCampaign(campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }
  const recipients = db
    .prepare(
      "SELECT * FROM recipients WHERE campaign_id = ? AND status = 'pending' ORDER BY id ASC"
    )
    .all(campaignId);

  if (!recipients.length) {
    return { sentCount: 0 };
  }

  const updateRecipient = db.prepare(
    "UPDATE recipients SET status = 'sent' WHERE id = ?"
  );

  if (campaign.send_mode === 'single') {
    const first = recipients[0];
    const html = renderTemplate(campaign.body_html, { name: first?.name || 'There' });
    const toList = recipients.map(r => r.email);
    await sendMimeEmail({ to: toList, subject: campaign.subject, html });
    recipients.forEach(r => updateRecipient.run(r.id));
  } else {
    for (const r of recipients) {
      const html = renderTemplate(campaign.body_html, { name: r.name });
      await sendMimeEmail({ to: r.email, subject: campaign.subject, html });
      updateRecipient.run(r.id);
    }
  }

  db.prepare("UPDATE campaigns SET status = 'sent' WHERE id = ?").run(campaignId);
  return { sentCount: recipients.length };
}

router.post('/', (req, res) => {
  const { subject, body_html, send_mode, recipients, scheduled_at } = req.body || {};
  if (!subject || !body_html || !send_mode) {
    return res.status(400).json({ error: 'subject, body_html, send_mode are required' });
  }
  if (!Array.isArray(recipients) || !recipients.length) {
    return res.status(400).json({ error: 'recipients are required' });
  }
  if (!['single', 'individual'].includes(send_mode)) {
    return res.status(400).json({ error: 'send_mode must be single or individual' });
  }

  const insertCampaign = db.prepare(
    'INSERT INTO campaigns (subject, body_html, send_mode, scheduled_at, status) VALUES (?, ?, ?, ?, ?)' 
  );
  const insertRecipient = db.prepare(
    'INSERT INTO recipients (campaign_id, email, name, status) VALUES (?, ?, ?, ?)' 
  );

  const tx = db.transaction(() => {
    const result = insertCampaign.run(subject, body_html, send_mode, scheduled_at || null, 'draft');
    const campaignId = result.lastInsertRowid;
    for (const r of recipients) {
      insertRecipient.run(campaignId, r.email, r.name || 'There', 'pending');
    }
    return campaignId;
  });

  const campaignId = tx();
  return res.json({ id: campaignId, status: 'draft' });
});

router.post('/:id/preview', (req, res) => {
  const { id } = req.params;
  const campaign = fetchCampaign(id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  const recipient = db
    .prepare('SELECT * FROM recipients WHERE campaign_id = ? ORDER BY id ASC LIMIT 1')
    .get(id);
  if (!recipient) return res.status(404).json({ error: 'No recipients' });
  const html = renderTemplate(campaign.body_html, { name: recipient.name });
  res.json({ html });
});

router.post('/:id/send', async (req, res) => {
  const { id } = req.params;
  const campaign = fetchCampaign(id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });

  if (campaign.scheduled_at) {
    db.prepare("UPDATE campaigns SET status = 'scheduled' WHERE id = ?").run(id);
    return res.json({ status: 'scheduled' });
  }

  try {
    const result = await sendCampaign(id);
    return res.json({ status: 'sent', ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to send' });
  }
});

module.exports = {
  router,
  sendCampaign,
};
