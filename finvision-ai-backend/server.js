const path = require('path');
const express = require('express');
const cors = require('cors');
const { loadDB, saveDB } = require('./db');
const {
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiryDate
} = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());
// CORS stays open (cors() with no options) so the finvision-ai-frontend
// project can still be hosted completely separately and call this API
// cross-origin if you choose to deploy it that way — nothing below removes
// that ability.
//
// In addition, this server now also serves a static copy of the frontend
// from ./public (see public/index.html), so visiting the server's own URL
// (e.g. http://localhost:3000/) shows the app instead of "Cannot GET /".
// All API routes remain under /api and are unaffected.
app.use(express.static(path.join(__dirname, 'public')));

// Persistent data store: loaded once from data/db.json on startup, and
// written back to that file (via persist(), below) after every change so
// nothing is lost when the server restarts. See db.js for details.
const db = loadDB();
const usersDB = db.users;                 // { id, email, passwordHash, name, role }
const refreshTokensDB = db.refreshTokens; // { id, userId, tokenHash, expiresAt }
const profilesDB = db.profiles;           // { userId, records, budgetPlan, goals, updatedAt }

function persist() {
  saveDB(db);
}

function findProfile(userId) {
  return profilesDB.find(p => p.userId === userId);
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const user = verifyAccessToken(token);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired access token' });
  }
}

// Routes
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });

  const existing = usersDB.find(u => u.email === email);
  if (existing) return res.status(400).json({ error: 'User already exists' });

  const passwordHash = await hashPassword(password);
  const newUser = { id: String(usersDB.length + 1), name, email, passwordHash, role: 'user' };
  usersDB.push(newUser);

  const accessToken = signAccessToken(newUser);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  refreshTokensDB.push({
    id: String(refreshTokensDB.length + 1),
    userId: newUser.id,
    tokenHash,
    expiresAt: refreshExpiryDate()
  });
  persist();

  res.json({ accessToken, refreshToken, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = usersDB.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  refreshTokensDB.push({
    id: String(refreshTokensDB.length + 1),
    userId: user.id,
    tokenHash,
    expiresAt: refreshExpiryDate()
  });
  persist();

  res.json({ accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  const incomingHash = hashRefreshToken(refreshToken);
  const tokenIndex = refreshTokensDB.findIndex(t => t.tokenHash === incomingHash && new Date(t.expiresAt) > new Date());

  if (tokenIndex === -1) {
    return res.status(403).json({ error: 'Invalid or expired refresh token' });
  }

  const tokenRecord = refreshTokensDB[tokenIndex];
  const user = usersDB.find(u => u.id === tokenRecord.userId);
  if (!user) return res.status(403).json({ error: 'User not found' });

  // Rotate Refresh Token
  refreshTokensDB.splice(tokenIndex, 1);
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);

  refreshTokensDB.push({
    id: String(refreshTokensDB.length + 1),
    userId: user.id,
    tokenHash: newTokenHash,
    expiresAt: refreshExpiryDate()
  });
  persist();

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

app.post('/api/auth/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const incomingHash = hashRefreshToken(refreshToken);
    const index = refreshTokensDB.findIndex(t => t.tokenHash === incomingHash);
    if (index !== -1) refreshTokensDB.splice(index, 1);
    persist();
  }
  res.json({ message: 'Logged out successfully' });
});

app.get('/api/protected-data', authenticateToken, (req, res) => {
  res.json({ message: `Hello ${req.user.name}, this is secured data from FinVision server!` });
});

// ---- Financial profile persistence ----
// This is what makes the dashboard's saved months, budget plan and goals
// survive a logout: they're stored here per-account (keyed by the user's
// id from their JWT), not just in the browser tab.
//
// `records` holds one entry per saved month, e.g. { "2026-08": {...} }.
// Only the most recent MAX_HISTORY_MONTHS are kept (oldest evicted first)
// so a user's "Previous Data" history never grows unbounded — this mirrors
// the same trim the frontend does client-side.
const MAX_HISTORY_MONTHS = 12;
function trimRecordsToMaxMonths(records) {
  const keys = Object.keys(records).sort(); // "YYYY-MM" sorts chronologically as a string
  while (keys.length > MAX_HISTORY_MONTHS) {
    delete records[keys.shift()];
  }
  return records;
}

app.get('/api/profile', authenticateToken, (req, res) => {
  const profile = findProfile(req.user.sub);
  res.json({
    records: profile ? profile.records : {},
    budgetPlan: profile ? profile.budgetPlan : null,
    goals: profile ? profile.goals : [],
    updatedAt: profile ? profile.updatedAt : null,
  });
});

app.put('/api/profile', authenticateToken, (req, res) => {
  const { records, budgetPlan, goals } = req.body || {};

  let profile = findProfile(req.user.sub);
  if (!profile) {
    profile = { userId: req.user.sub, records: {}, budgetPlan: null, goals: [] };
    profilesDB.push(profile);
  }

  if (records && typeof records === 'object') profile.records = trimRecordsToMaxMonths({ ...records });
  if (budgetPlan && typeof budgetPlan === 'object') profile.budgetPlan = budgetPlan;
  if (Array.isArray(goals)) profile.goals = goals;
  profile.updatedAt = new Date().toISOString();

  persist();
  res.json({ message: 'Profile saved', updatedAt: profile.updatedAt });
});

// Catch-all for unmatched /api/* routes: always return JSON (never fall
// through to an HTML 404 page), so the frontend never tries to JSON-parse
// an HTML error page.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route: ${req.method} ${req.originalUrl}` });
});

// SPA fallback: any other GET (e.g. a refresh on a client-side route, or
// just "/") resolves to the app shell instead of a bare "Cannot GET" page.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FinVision server running on http://localhost:${PORT}`));
