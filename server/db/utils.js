import { promisify } from 'util';
import { isPg } from './database.js';

// Helper to convert ? to $1, $2, etc.
const convertQuery = (query) => {
  let index = 1;
  return query.replace(/\?/g, () => `$${index++}`);
};

// Promisified database functions
export const promisifyDb = (db) => {

  if (isPg()) {
    // PostgreSQL Implementation
    const get = async (query, params = []) => {
      const sql = convertQuery(query);
      console.log('PG GET:', sql, params);
      try {
        const res = await db.query(sql, params);
        return res.rows[0];
      } catch (err) {
        console.error('PG GET Error:', err);
        throw err;
      }
    };

    const all = async (query, params = []) => {
      const sql = convertQuery(query);
      console.log('PG ALL:', sql, params);
      try {
        const res = await db.query(sql, params);
        return res.rows;
      } catch (err) {
        console.error('PG ALL Error:', err);
        throw err;
      }
    };

    const run = async (query, params = []) => {
      let sql = convertQuery(query);

      // Handle INSERT returning ID
      if (sql.trim().toUpperCase().startsWith('INSERT') && !sql.toUpperCase().includes('RETURNING')) {
        sql += ' RETURNING id';
      }

      console.log('PG RUN:', sql, params);

      try {
        const res = await db.query(sql, params);
        return {
          lastID: res.rows[0]?.id,
          changes: res.rowCount
        };
      } catch (err) {
        console.error('PG RUN Error:', err);
        throw err;
      }
    };

    return { get, all, run };
  }

  // SQLite Implementation (Legacy)
  const get = promisify((query, params, callback) => {
    db.get(query, params, callback);
  });

  const all = promisify((query, params, callback) => {
    db.all(query, params, callback);
  });

  // Custom promisified run function that preserves 'this' context
  const run = (query, params) => {
    return new Promise((resolve, reject) => {
      db.run(query, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  };

  return { get, all, run };
};
