#!/usr/bin/env node
/**
 * ENCRYPTION_KEY rotation helper (I19a).
 *
 * ENCRYPTION_KEY is a data key: it encrypts GitHub OAuth tokens stored in
 * `github_connections.encrypted_token` / `refresh_token`. Rotating it without
 * re-encrypting breaks those connections.
 *
 * Usage:
 *   node scripts/rotate-encryption-key.mjs --check [--db data/capacinator.db]
 *   node scripts/rotate-encryption-key.mjs --rotate [--db ...]
 *   OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... \
 *     node scripts/rotate-encryption-key.mjs --re-encrypt [--db ...]
 *
 * --check  : read-only inventory; exits 0 with counts.
 * --rotate : refuses if encrypted rows exist; safe only after --check returns 0.
 * --re-encrypt : decrypts with OLD and re-encrypts with NEW in one transaction.
 *
 * Exit codes: 0 = ok, 1 = unsafe/refused, 2 = missing tool/DB/key.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function resolveDbPath() {
  const explicit = value('--db');
  if (explicit) return path.resolve(explicit);
  const url = process.env.DATABASE_URL;
  if (url?.startsWith('sqlite:')) return path.resolve(url.slice('sqlite:'.length));
  if (process.env.DB_FILENAME) {
    const file = process.env.DB_FILENAME;
    return path.resolve(file.includes('/') ? file : path.join('data', file));
  }
  return path.join(ROOT, 'data', 'capacinator.db');
}

function openDb(file, readonly) {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    console.error('✗ better-sqlite3 is not installed');
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    console.error(`✗ database not found: ${file}`);
    process.exit(2);
  }
  return new Database(file, { readonly, fileMustExist: true });
}

function tableExists(db, name) {
  return !!db.prepare("select name from sqlite_master where type='table' and name=?").get(name);
}

function inventory(db) {
  if (!tableExists(db, 'github_connections')) {
    return { table: false, rows: 0, encrypted: 0 };
  }
  const rows = db.prepare('select count(*) as n from github_connections').get().n;
  const encrypted = db.prepare(
    "select count(*) as n from github_connections where coalesce(encrypted_token,'') <> '' or coalesce(refresh_token,'') <> ''"
  ).get().n;
  return { table: true, rows, encrypted };
}

function parseKey(name) {
  const raw = process.env[name];
  if (!raw) {
    console.error(`✗ ${name} is not set`);
    process.exit(2);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    console.error(`✗ ${name} must be base64-encoded 32 bytes; got ${key.length}`);
    process.exit(2);
  }
  return key;
}

function decrypt(key, ciphertext) {
  const parts = String(ciphertext).split(':');
  if (parts.length !== 4 || parts[0] !== 'encrypted') throw new Error('invalid ciphertext format');
  const [, ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

function encrypt(key, plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let out = cipher.update(plaintext, 'utf8', 'hex');
  out += cipher.final('hex');
  return `encrypted:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${out}`;
}

function main() {
  const dbPath = resolveDbPath();
  if (!has('--check') && !has('--rotate') && !has('--re-encrypt')) {
    console.log('usage: rotate-encryption-key.mjs --check|--rotate|--re-encrypt [--db path]');
    process.exit(2);
  }

  if (has('--check') || has('--rotate')) {
    const db = openDb(dbPath, true);
    try {
      const info = inventory(db);
      console.log(`db: ${dbPath}`);
      console.log(`github_connections: table=${info.table} rows=${info.rows} encrypted=${info.encrypted}`);
      if (has('--rotate') && info.encrypted > 0) {
        console.error('✗ refusing --rotate: encrypted rows exist; use --re-encrypt or defer');
        process.exit(1);
      }
      if (has('--rotate')) {
        console.log('✓ no encrypted rows; safe to replace ENCRYPTION_KEY in this environment');
      }
      return;
    } finally {
      db.close();
    }
  }

  if (has('--re-encrypt')) {
    const oldKey = parseKey('OLD_ENCRYPTION_KEY');
    const newKey = parseKey('NEW_ENCRYPTION_KEY');
    const db = openDb(dbPath, false);
    try {
      if (!tableExists(db, 'github_connections')) {
        console.log('✓ github_connections table does not exist; nothing to re-encrypt');
        return;
      }
      const rows = db.prepare(
        "select id, encrypted_token, refresh_token, encryption_version from github_connections where coalesce(encrypted_token,'') <> '' or coalesce(refresh_token,'') <> ''"
      ).all();
      const update = db.prepare(
        'update github_connections set encrypted_token = ?, refresh_token = ?, encryption_version = ?, updated_at = CURRENT_TIMESTAMP where id = ?'
      );
      const run = db.transaction((items) => {
        for (const row of items) {
          const token = row.encrypted_token ? encrypt(newKey, decrypt(oldKey, row.encrypted_token)) : null;
          const refresh = row.refresh_token ? encrypt(newKey, decrypt(oldKey, row.refresh_token)) : null;
          update.run(token, refresh, (row.encryption_version ?? 1) + 1, row.id);
        }
      });
      run(rows);
      console.log(`✓ re-encrypted ${rows.length} github_connections row(s); update ENCRYPTION_KEY in the environment now`);
    } catch (error) {
      console.error(`✗ re-encrypt failed, transaction rolled back: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    } finally {
      db.close();
    }
  }
}

main();
