const express = require('express');
const { Types } = require('mongoose');
const { Template } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const templates = await Template.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    res.json(
      templates.map(t => ({
        id: t._id.toString(),
        title: t.title,
        subject: t.subject,
        body_html: t.body_html,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load templates' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const template = await Template.findOne({ _id: id, userId: req.user._id });
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json({
      id: template._id.toString(),
      title: template.title,
      subject: template.subject,
      body_html: template.body_html,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load template' });
  }
});

router.post('/', async (req, res) => {
  const { title, subject, body_html } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
  if (!body_html || !body_html.trim()) return res.status(400).json({ error: 'Body is required' });
  try {
    const doc = await Template.create({ userId: req.user._id, title: title.trim(), subject, body_html });
    res.json({ id: doc._id.toString(), title: doc.title });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
});

module.exports = router;
