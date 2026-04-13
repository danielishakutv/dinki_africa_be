const http = require('http');
const app = require('./app');
const config = require('./config');
const db = require('./config/database');
const redis = require('./config/redis');

const server = http.createServer(app);

// Socket.IO will be attached here later
// const { Server } = require('socket.io');
// const io = new Server(server, { ... });

async function start() {
  try {
    // Test database connection
    await db.raw('SELECT 1');
    console.log('PostgreSQL connected');

    // Test Redis connection
    await redis.ping();
    console.log('Redis connected');

    server.listen(config.port, () => {
      console.log(`Dinki API running on port ${config.port} [${config.env}]`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down...');
  server.close();
  await db.destroy();
  redis.disconnect();
  process.exit(0);
});

start();
