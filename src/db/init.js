const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/pickems.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_a TEXT NOT NULL,
        team_b TEXT NOT NULL,
        start_time TEXT NOT NULL,
        stage TEXT NOT NULL,
        result TEXT DEFAULT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS leaderboard (
        user_id TEXT PRIMARY KEY,
        points INTEGER DEFAULT 0,
        stats TEXT DEFAULT '{}'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS results (
        match_id INTEGER,
        result TEXT NOT NULL,
        FOREIGN KEY(match_id) REFERENCES matches(id)
    )`);
});

db.close();