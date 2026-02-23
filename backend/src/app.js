require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { getAuthUrl, exchangeCodeForUser, verifyAuth } = require('./gmail');
const recipientRoutes = require('./routes/recipients');
const { router: campaignRoutes } = require('./routes/campaigns');
const groupRoutes = require('./routes/groups');
const templateRoutes = require('./routes/templates');
const variableRoutes = require('./routes/variables');
const { startScheduler } = require('./scheduler');
const { connectMongo, User } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/jobhunt';
const isProd = process.env.NODE_ENV === 'production';

function initFirebase() {
  if (admin.apps.length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase service account env vars');
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

initFirebase();

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/auth/', authLimiter);
app.use('/api/', apiLimiter);

/* ── middleware ── */

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  try {
    const decoded = await admin.auth().verifyIdToken(token, true);
    const { uid, email, name } = decoded;
    if (!uid || !email) return res.status(401).json({ error: 'Invalid token' });

    const update = { email: email.toLowerCase(), displayName: name || email };
    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      {
        firebaseUid: uid,
        ...update,
        $setOnInsert: { gmailConnected: false },
      },
      { upsert: true, new: true }
    );

    req.user = user;
    req.firebaseToken = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Auth failed' });
  }
}

/* ── routes ── */

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = req.user;
  res.json({
    user: {
      id: user._id.toString(),
      firebaseUid: user.firebaseUid,
      email: user.email,
      displayName: user.displayName,
    },
    gmailConnected: !!user.gmailConnected,
    gmailEmail: user.gmailEmail || user.email,
  });
});

app.post('/gmail/connect', requireAuth, async (req, res) => {
  try {
    const needsConsent = !req.user.encryptedRefreshToken;
    const state = crypto.randomBytes(16).toString('hex');
    req.user.gmailState = state;
    req.user.gmailStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await req.user.save();
    const url = getAuthUrl({ state, prompt: needsConsent ? 'consent' : 'none' });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to start Gmail connect' });
  }
});

app.post('/gmail/disconnect', requireAuth, async (req, res) => {
  try {
    req.user.encryptedRefreshToken = undefined;
    req.user.gmailConnected = false;
    req.user.gmailEmail = undefined;
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to disconnect Gmail' });
  }
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query || {};
  const frontendOrigin = FRONTEND_ORIGIN;
  if (!code || !state) return res.redirect(`${frontendOrigin}?auth=error&reason=missing_code`);
  try {
    const user = await User.findOne({ gmailState: state, gmailStateExpiresAt: { $gte: new Date() } });
    if (!user) return res.redirect(`${frontendOrigin}?auth=error&reason=invalid_state`);
    await exchangeCodeForUser(user, code);
    user.gmailState = undefined;
    user.gmailStateExpiresAt = undefined;
    user.gmailConnected = true;
    await user.save();
    return res.redirect(`${frontendOrigin}?gmail=success`);
  } catch (err) {
    console.error('[auth] Callback error:', err.message);
    return res.redirect(`${frontendOrigin}?gmail=error&reason=${encodeURIComponent(err.message)}`);
  }
});

// Authenticated API routes
app.use('/api/recipients', requireAuth, recipientRoutes);
app.use('/api/campaigns', requireAuth, campaignRoutes);
app.use('/api/groups', requireAuth, groupRoutes);
app.use('/api/templates', requireAuth, templateRoutes);
app.use('/api/variables', requireAuth, variableRoutes);

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
