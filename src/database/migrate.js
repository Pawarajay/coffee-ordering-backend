const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function runMigrations() {
  let connection;
  let retries = 5;
  while (retries > 0) {
    try {
      connection = await mysql.createConnection({
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database: env.db.name,
        multipleStatements: true,
      });
      break;
    } catch (err) {
      console.log('Connection failed, retrying...', retries);
      retries--;
      if (retries === 0) throw err;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.toLowerCase().endsWith('.sql')).sort();

  console.log('Starting migrations...');
  for (const file of files) {
    console.log(`Running ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await connection.query(sql);
      console.log(`Successfully executed ${file}`);
    } catch (e) {
      console.error(`Error executing ${file}:`, e.message);
      process.exit(1);
    }
  }
  console.log('All migrations completed successfully.');
  await connection.end();
}

runMigrations().catch(console.error);