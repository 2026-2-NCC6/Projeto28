const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.SMART_TENNIS_DB_PATH || path.join(__dirname, 'smart_tennis.db');

let db = null;

function getDatabase() {
  if (!db) {
    const currentPath = process.env.SMART_TENNIS_DB_PATH || path.join(__dirname, 'smart_tennis.db');
    db = new sqlite3.Database(currentPath, (err) => {
      if (err) {
        console.error('[DB] Erro ao conectar ao SQLite:', err.message);
      } else {
        console.log('[DB] Conectado ao banco SQLite local:', currentPath);
      }
    });
  }
  return db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    getDatabase().exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function closeDb() {
  return new Promise((resolve) => {
    if (db) {
      db.close(() => {
        db = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  getDatabase,
  run,
  get,
  all,
  exec,
  closeDb,
  DB_PATH
};
