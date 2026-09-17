// Lightweight file-based "database" for FinVision.
//
// This replaces the old plain in-memory arrays (which lost every user,
// session and saved financial profile the moment the server restarted)
// with data that is written to disk as JSON and reloaded on startup.
// No external database engine or extra npm package is required, so it
// runs anywhere Node runs, with zero additional setup.
//
// If you later want to swap this for a real database (Postgres, Mongo,
// SQLite, etc.), everything that touches storage goes through the four
// functions exported here, so only this file needs to change.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

function defaultData() {
  return {
    users: [],          // { id, name, email, passwordHash, role }
    refreshTokens: [],  // { id, userId, tokenHash, expiresAt }
    profiles: [],       // { userId, records, budgetPlan, goals, updatedAt }
  };
}

// Reads the database file from disk. If it doesn't exist yet (first run)
// or is corrupted/empty, falls back to a fresh, empty database instead of
// crashing the server.
function loadDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultData();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) return defaultData();
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  } catch (err) {
    console.error('[db] Could not read data/db.json, starting with an empty database:', err.message);
    return defaultData();
  }
}

// Writes the whole database object back to disk. Called after every
// mutation (register, login, refresh, logout, profile save) so data
// survives a server restart.
function saveDB(db) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[db] Could not write data/db.json:', err.message);
  }
}

module.exports = { loadDB, saveDB, DATA_FILE };
