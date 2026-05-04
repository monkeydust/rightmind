/**
 * Backup the SQLite database.
 * 
 * Creates a timestamped copy in prisma/backups/.
 * Run: npm run db:backup
 */

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "prisma", "dev.db");
const BACKUP_DIR = path.join(__dirname, "..", "prisma", "backups");

if (!fs.existsSync(DB_PATH)) {
  console.error("✗ Database not found at", DB_PATH);
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupName = `dev-${timestamp}.db`;
const backupPath = path.join(BACKUP_DIR, backupName);

fs.copyFileSync(DB_PATH, backupPath);

const sizeMB = (fs.statSync(backupPath).size / 1024 / 1024).toFixed(2);
console.log(`✓ Backup saved: prisma/backups/${backupName} (${sizeMB} MB)`);
