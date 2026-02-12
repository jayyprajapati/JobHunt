const express = require('express');
const { Types } = require('mongoose');
const { Campaign } = require('../db');
const { renderTemplate } = require('../services/templateService');
const { sendMimeEmail } = require('../gmail');

const router = express.Router();

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function sendCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const pending = campaign.recipients.filter(r => r.status === 'pending');
  if (!pending.length) {
    return { status: campaign.status, sentCount: 0 };
  }

  if (campaign.send_mode === 'single') {
    const first = pending[0];
    const html = renderTemplate(campaign.body_html, { name: first?.name || 'There', company: first?.company || '' });
    const toList = pending.map(r => r.email);
    await sendMimeEmail({ to: toList, subject: campaign.subject, html, senderName: campaign.sender_name });
    pending.forEach(r => {
      const subdoc = campaign.recipients.id(r._id);
      if (subdoc) subdoc.status = 'sent';
    });
  } else {
    for (const recipient of pending) {
      const html = renderTemplate(campaign.body_html, { name: recipient.name, company: recipient.company || '' });
      try {
        await sendMimeEmail({ to: recipient.email, subject: campaign.subject, html, senderName: campaign.sender_name });
        const subdoc = campaign.recipients.id(recipient._id);
        if (subdoc) subdoc.status = 'sent';
      } catch (err) {
        const subdoc = campaign.recipients.id(recipient._id);
        if (subdoc) subdoc.status = 'failed';
      }
    }
  }

  campaign.status = 'sent';
  await campaign.save();
  return { status: 'sent', sentCount: pending.length };
}

router.post('/', async (req, res) => {
  try {
    const { subject, body_html, send_mode, recipients, scheduled_at, status, sender_name } = req.body || {};
    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }
    if (!body_html || !body_html.trim()) {
      return res.status(400).json({ error: 'Body is required' });
    }
    if (!send_mode || !['single', 'individual'].includes(send_mode)) {
      return res.status(400).json({ error: 'send_mode must be single or individual' });
    }
    if (!Array.isArray(recipients) || !recipients.length) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }

    const when = normalizeDate(scheduled_at);
    const initialStatus = status && ['draft', 'scheduled'].includes(status)
      ? status
      : when && when.getTime() > Date.now()
        ? 'scheduled'
        : 'draft';

    const doc = await Campaign.create({
      subject,
      body_html,
      sender_name: sender_name || '',
      send_mode,
      recipients: recipients.map(r => ({ email: r.email, name: r.name || 'There', company: r.company || 'Company', status: 'pending' })),
      scheduled_at: when,
      status: initialStatus,
    });

    return res.json({ id: doc._id.toString(), status: doc.status });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to create campaign' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const { subject, body_html, send_mode, recipients, scheduled_at, status, sender_name } = req.body || {};
    const update = {};
    if (subject !== undefined) update.subject = subject;
    if (body_html !== undefined) update.body_html = body_html;
    if (sender_name !== undefined) update.sender_name = sender_name;
    if (send_mode && ['single', 'individual'].includes(send_mode)) update.send_mode = send_mode;
    if (status && ['draft', 'scheduled', 'sent'].includes(status)) update.status = status;
    if (scheduled_at !== undefined) update.scheduled_at = normalizeDate(scheduled_at);
    if (Array.isArray(recipients)) {
      update.recipients = recipients.map(r => ({
        _id: r._id || new Types.ObjectId(),
        email: r.email,
        name: r.name || 'There',
        company: r.company || 'Company',
        status: r.status || 'pending',
      }));
    }
    update.updated_at = new Date();

    const doc = await Campaign.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json({ id: doc._id.toString(), status: doc.status });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update campaign' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const rows = await Campaign.aggregate([
      {
        $project: {
          subject: 1,
          status: 1,
          scheduled_at: 1,
          created_at: 1,
          recipient_count: { $size: '$recipients' },
        },
      },
      { $sort: { created_at: -1 } },
    ]);
    res.json(rows.map(r => ({ ...r, id: r._id.toString() })));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load campaigns' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const doc = await Campaign.findById(id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const payload = doc.toObject({ versionKey: false });
    payload.id = payload._id.toString();
    delete payload._id;
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load campaign' });
  }
});

router.post('/:id/preview', async (req, res) => {
  const { id } = req.params;
  const { recipient_id } = req.body || {};
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const campaign = await Campaign.findById(id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });
    const target = recipient_id
      ? campaign.recipients.id(recipient_id)
      : campaign.recipients[0];
    if (!target) return res.status(404).json({ error: 'No recipients' });
    const html = renderTemplate(campaign.body_html, { name: target.name || 'There', company: target.company || '' });
    res.json({ html });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to render preview' });
  }
});

router.post('/:id/send', async (req, res) => {
  const { id } = req.params;
  const { confirm_bulk_send } = req.body || {};
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const campaign = await Campaign.findById(id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    const recipientCount = campaign.recipients.length;
    if (recipientCount > 5 && !confirm_bulk_send) {
      return res.status(400).json({ error: 'Bulk send confirmation required' });
    }

    const scheduledAt = campaign.scheduled_at ? new Date(campaign.scheduled_at) : null;
    const isFuture = scheduledAt && !Number.isNaN(scheduledAt) && scheduledAt.getTime() > Date.now();

    if (isFuture) {
      campaign.status = 'scheduled';
      await campaign.save();
      return res.json({ status: 'scheduled' });
    }

    const result = await sendCampaign(id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to send' });
  }
});

module.exports = {
  router,
  sendCampaign,
};
