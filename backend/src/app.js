require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getAuthUrl, handleAuthCode, isAuthenticated, getSenderProfile } = require('./gmail');
const recipientRoutes = require('./routes/recipients');
const { router: campaignRoutes } = require('./routes/campaigns');
const groupRoutes = require('./routes/groups');
const templateRoutes = require('./routes/templates');
const { startScheduler } = require('./scheduler');
const { connectMongo } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/auth/status', (_req, res) => {
  res.json({ authenticated: isAuthenticated(), sender: getSenderProfile() });
});

app.get('/auth/google', (_req, res) => {
  try {
    const url = getAuthUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    await handleAuthCode(code);
    res.send('Authorization successful. You can return to the app.');
  } catch (err) {
    res.status(500).send(err.message || 'Failed to authorize');
  }
});

app.use('/api/recipients', recipientRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/templates', templateRoutes);

connectMongo()
  .then(() => {
    console.log('Connected to MongoDB');
    startScheduler();
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB', err.message);
    process.exit(1);
  });
