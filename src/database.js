const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '..', 'data', 'bot.db');
let db = null;

const getDb = () => {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        telegram_user_id TEXT PRIMARY KEY,
        session_id TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id TEXT,
        user_message TEXT,
        bot_response TEXT,
        created_at TEXT
      );
    `);
  }
  return db;
};

const getSession = (userId) => {
  const row = getDb().prepare('SELECT session_id FROM sessions WHERE telegram_user_id = ?').get(String(userId));
  return row?.session_id || null;
};

const saveSession = (userId, sessionId) => {
  if (sessionId) {
    getDb().prepare(`
      INSERT INTO sessions (telegram_user_id, session_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(telegram_user_id) DO UPDATE SET session_id = ?, updated_at = ?
    `).run(String(userId), sessionId, new Date().toISOString(), sessionId, new Date().toISOString());
  } else {
    getDb().prepare('DELETE FROM sessions WHERE telegram_user_id = ?').run(String(userId));
  }
};

const logMessage = (userId, userMsg, botResp) => {
  try {
    getDb().prepare(`
      INSERT INTO audit_log (telegram_user_id, user_message, bot_response, created_at)
      VALUES (?, ?, ?, ?)
    `).run(String(userId), userMsg.slice(0, 10000), botResp.slice(0, 50000), new Date().toISOString());
  } catch (e) { console.error(`[DB] logMessage failed: ${e.message}`); }
};

// Initialize DB eagerly at startup (avoid race conditions from concurrent handlers)
getDb();

module.exports = { getSession, saveSession, logMessage };
