import { promisify } from 'util';

// Promisified database functions
export const promisifyDb = (db) => {
  const get = promisify((query, params, callback) => {
    db.get(query, params, callback);
  });

  const all = promisify((query, params, callback) => {
    db.all(query, params, callback);
  });

  // Custom promisified run function that preserves 'this' context
  const run = (query, params) => {
    return new Promise((resolve, reject) => {
      db.run(query, params, function(err) {
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

