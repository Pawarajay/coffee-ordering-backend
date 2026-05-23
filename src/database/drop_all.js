const mysql = require('mysql2/promise');
const env = require('../config/env');

async function dropAllTables() {
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
      });
      break;
    } catch (err) {
      console.log('Connection failed, retrying...', retries);
      retries--;
      if (retries === 0) throw err;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('Fetching all tables...');
  const [rows] = await connection.query('SHOW TABLES');
  const tables = rows.map(r => Object.values(r)[0]);

  if (tables.length > 0) {
    console.log(`Dropping ${tables.length} tables...`);
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of tables) {
      await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('All tables dropped successfully.');
  } else {
    console.log('No tables found to drop.');
  }

  await connection.end();
}

dropAllTables().catch(console.error);
