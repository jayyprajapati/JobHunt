require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getAuthUrl, handleAuthCode, hasTokens, verifyAuth, clearAuth, getSenderProfile } = require('./gmail');
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

app.get('/auth/status', async (_req, res) => {
  try {
    // Quick check first — if no tokens file at all, skip the API call
    if (!hasTokens()) {
      return res.json({ authenticated: false, sender: null });
    }
    // Actually verify tokens against Google
    const result = await verifyAuth();
    if (result.valid) {
      return res.json({
        authenticated: true,
        sender: getSenderProfile(),
        email: result.email,
      });
    }
    // Tokens exist but are invalid — verifyAuth already cleared them
    return res.json({ authenticated: false, sender: null, error: result.error });
  } catch (err) {
    return res.json({ authenticated: false, sender: null, error: err.message });
  }
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
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  if (!code) return res.redirect(`${frontendOrigin}?auth=error&reason=missing_code`);
  try {
    await handleAuthCode(code);
    res.redirect(`${frontendOrigin}?auth=success`);
  } catch (err) {
    console.error('[auth] Callback error:', err.message);
    res.redirect(`${frontendOrigin}?auth=error&reason=${encodeURIComponent(err.message)}`);
  }
});

app.post('/auth/disconnect', (_req, res) => {
  clearAuth();
  res.json({ ok: true });
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
