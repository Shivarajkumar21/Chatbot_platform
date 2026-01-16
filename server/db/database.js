import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;
let isPostgres = false;

export const getDb = () => db;
export const isPg = () => isPostgres;

// Helper to adapt SQL for Postgres if needed
const adaptSql = (sql) => {
  if (!isPostgres) return sql;

  // Replace SQLite specific types/keywords with Postgres equivalents for Schema Creation
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
    .replace(/DATETIME/g, 'TIMESTAMP');
};

export const initDatabase = () => {
  return new Promise((resolve, reject) => {

    // Check for Postgres (Support generic URL or Prisma-specific URL)
    const pgUrl = process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

    if (pgUrl) {
      console.log('Connecting to PostgreSQL...');
      isPostgres = true;
      db = new Pool({
        connectionString: pgUrl,
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Test connection
      db.connect((err, client, release) => {
        if (err) {
          console.error('Error connecting to PostgreSQL:', err);
          reject(err);
        } else {
          console.log('Connected to PostgreSQL database');
          release();
          createTables().then(resolve).catch(reject);
        }
      });
      return;
    }

    // Fallback to SQLite
    console.log('Connecting to SQLite (Fallback)...');
    let dbPath = path.join(__dirname, '..', 'database.sqlite');

    // Vercel / Serverless Environment Check for SQLite copying (Access only)
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      const tmpDbPath = '/tmp/database.sqlite';
      if (!fs.existsSync(tmpDbPath)) {
        if (fs.existsSync(dbPath)) {
          try {
            fs.copyFileSync(dbPath, tmpDbPath);
            console.log('Copied database to /tmp');
          } catch (e) {
            console.error('Failed to copy DB to /tmp', e);
          }
        }
      }
      dbPath = tmpDbPath;
    }

    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err);
        reject(err);
      } else {
        console.log(`Connected to SQLite at ${dbPath}`);
        createTables().then(resolve).catch(reject);
      }
    });
  });
};

const createTables = async () => {
  let run;

  if (isPostgres) {
    run = async (sql) => db.query(adaptSql(sql));
  } else {
    run = promisify(db.run.bind(db));
  }

  try {
    // Users table
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        is_verified INTEGER DEFAULT 0,
        otp_code TEXT,
        otp_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add columns if they don't exist (for SQLite/Postgres)
    // Note: detailed column checking is complex in cross-db, simpler to catch error or check blindly
    try {
      await run('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0');
    } catch (e) { /* ignore if exists */ }
    try {
      await run('ALTER TABLE users ADD COLUMN otp_code TEXT');
    } catch (e) { /* ignore if exists */ }
    try {
      await run('ALTER TABLE users ADD COLUMN otp_expires_at DATETIME');
    } catch (e) { /* ignore if exists */ }

    // Ensure existing users are verified (migration)
    await run('UPDATE users SET is_verified = 1 WHERE is_verified IS NULL');


    // Services/Agents table
    await run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Pending Users table (for OTP verification)
    await run(`
      CREATE TABLE IF NOT EXISTS pending_users (
        email TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT,
        otp_code TEXT NOT NULL,
        otp_expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Prompts table
    await run(`
      CREATE TABLE IF NOT EXISTS prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        is_system_prompt INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Messages table
    await run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Files table
    await run(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        file_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        purpose TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    console.log('Database tables verified/created');
  } catch (err) {
    console.error('Error creating tables:', err);
    throw err;
  }
};
