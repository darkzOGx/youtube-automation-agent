const { Database } = require('./db');

async function main() {
  const db = new Database();

  try {
    await db.initialize();
    await db.close();
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
