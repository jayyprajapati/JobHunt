const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    send_mode TEXT CHECK(send_mode IN ('single','individual')) NOT NULL,
    scheduled_at TEXT,
    status TEXT CHECK(status IN ('draft','scheduled','sent')) NOT NULL DEFAULT 'draft'
  );

  CREATE TABLE IF NOT EXISTS recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending','sent')) NOT NULL DEFAULT 'pending',
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
  );
`);

module.exports = db;
