const express = require('express');
const { Variable } = require('../db');

const router = express.Router();

function validateKey(key) {
  return /^[a-z0-9]+$/.test(key);
}

router.get('/', async (req, res) => {
  try {
    const vars = await Variable.find({ userId: req.user._id }).sort({ createdAt: 1 });
    res.json(vars.map(v => ({
      id: v._id.toString(),
      key: v.key,
      label: v.label,
      required: v.required,
      description: v.description,
      createdAt: v.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load variables' });
  }
});

router.post('/', async (req, res) => {
  const { key, label, required, description } = req.body || {};
  if (!key || !validateKey(key)) {
    return res.status(400).json({ error: 'Key must be lowercase alphanumeric with no spaces' });
  }
  if (!label || !String(label).trim()) {
    return res.status(400).json({ error: 'Label is required' });
  }
  try {
    const doc = await Variable.create({
      userId: req.user._id,
      key: key.toLowerCase(),
      label: String(label).trim(),
      required: !!required,
      description: description ? String(description).trim() : '',
    });
    res.json({
      id: doc._id.toString(),
      key: doc.key,
      label: doc.label,
      required: doc.required,
      description: doc.description,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Variable key must be unique per user' });
    }
    res.status(500).json({ error: err.message || 'Failed to create variable' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Variable.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete variable' });
  }
});

module.exports = router;
