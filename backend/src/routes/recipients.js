const express = require('express');
const { parseRecipients } = require('../services/recipientParser');

const router = express.Router();

router.post('/parse', (req, res) => {
  const { rawInput } = req.body || {};
  const recipients = parseRecipients(rawInput || '');
  return res.json(recipients);
});

module.exports = router;
