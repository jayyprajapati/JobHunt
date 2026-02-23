const express = require('express');
const { Types } = require('mongoose');
const { Group, Variable } = require('../db');

const router = express.Router();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function normalizeRecipients(list, userId) {
  if (!Array.isArray(list)) return [];
  const vars = await Variable.find({ userId });
  const allowed = new Set(vars.map(v => v.key).concat(['name']));
  const seen = new Set();
  const clean = [];
  for (const r of list) {
    const email = (r.email || '').toLowerCase().trim();
    const name = (r.name || '').trim();
    if (!emailRegex.test(email) || !name) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    const variables = {};
    Object.entries(r.variables || {}).forEach(([k, v]) => {
      const key = String(k).toLowerCase();
      if (allowed.has(key)) variables[key] = String(v || '').trim();
    });
    clean.push({ email, name, variables });
  }
  return clean;
}

router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ userId: req.user._id }).sort({ updatedAt: -1 });
    const payload = groups.map(g => ({
      id: g._id.toString(),
      title: g.title,
      recipients: g.recipients,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load groups' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Not found' });
    res.json({
      id: group._id.toString(),
      title: group.title,
      recipients: group.recipients,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load group' });
  }
});

router.post('/', async (req, res) => {
  const { title, recipients } = req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const cleanRecipients = await normalizeRecipients(recipients, req.user._id);
  if (!cleanRecipients.length) {
    return res.status(400).json({ error: 'At least one valid recipient is required' });
  }
  try {
    const doc = await Group.create({ userId: req.user._id, title: title.trim(), recipients: cleanRecipients });
    res.json({ id: doc._id.toString(), title: doc.title });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create group' });
  }
});

router.post('/:id/append', async (req, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const additions = await normalizeRecipients(req.body?.recipients || [], req.user._id);
  if (!additions.length) {
    return res.status(400).json({ error: 'No new recipients to add' });
  }
  try {
    const group = await Group.findOne({ _id: id, userId: req.user._id });
    if (!group) return res.status(404).json({ error: 'Not found' });
    const existingEmails = new Set(group.recipients.map(r => r.email));
    const filtered = additions.filter(r => !existingEmails.has(r.email));
    if (!filtered.length) {
      return res.json({ id: group._id.toString(), added: 0 });
    }
    group.recipients.push(...filtered);
    await group.save();
    res.json({ id: group._id.toString(), added: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update group' });
  }
});

module.exports = router;
