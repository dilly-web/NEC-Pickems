const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Path to the JSON file
const jsonFilePath = path.join(__dirname, 'matches.json');

// Path to your database file (absolute path for reliability)
const dbPath = path.resolve('/Users/dilly/Documents/NEC-Pickems/data/pickems.db');
console.log('Resolved database path:', dbPath);

// Open the database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error connecting to the database:', err.message);
    return;
  }
  console.log('Connected to the SQLite database.');
});

// Read the JSON file
fs.readFile(jsonFilePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading the JSON file:', err.message);
    return;
  }

  const schedule = JSON.parse(data);
  const week = schedule.week; // Get the week from the JSON object

  // Start a transaction
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    const query = `
      INSERT INTO matches (team_a, team_b, start_time, stage, week)
      VALUES (?, ?, ?, ?, ?)
    `;

    let errorOccurred = false;

    schedule.matches.forEach((match, index) => {
      const { team_a, team_b, date, stage = 'Regular Season' } = match;

      db.run(query, [team_a, team_b, date, stage, week], (err) => {
        if (err) {
          console.error(`Error inserting match at index ${index}: ${err.message}`);
          errorOccurred = true;
        }
      });
    });

    db.run('COMMIT', (err) => {
      if (err) {
        console.error('Error committing transaction:', err.message);
        db.run('ROLLBACK', () => {
          console.error('Transaction rolled back.');
          db.close();
        });
      } else {
        if (!errorOccurred) {
          console.log('All matches have been inserted successfully.');
        } else {
          console.log('Some matches were not inserted due to errors.');
        }
        db.close((closeErr) => {
          if (closeErr) {
            console.error('Error closing the database:', closeErr.message);
          } else {
            console.log('Database connection closed.');
          }
        });
      }
    });
  });
});