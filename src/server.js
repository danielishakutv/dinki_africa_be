const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const app = require('./app');
const config = require('./config');
const db = require('./config/database');
const redis = require('./config/redis');

const server = http.createServer(app);

// Socket.IO setup with JWT authentication
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});

// Make io accessible in controllers via req.app
app.set('io', io);

// Track online users
const onlineUsers = new Map();

// JWT authentication middleware for Socket.IO
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('AUTH_REQUIRED'));
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    return next(new Error('INVALID_TOKEN'));
  }
});

io.on('connection', (socket) => {
  const { userId } = socket;
  console.log(`Socket connected: ${userId}`);

  // Join personal room
  socket.join(`user:${userId}`);

  // Track online status
  onlineUsers.set(userId, socket.id);
  io.emit('presence', { userId, online: true });

  // Handle message:send event
  socket.on('message:send', async ({ conversationId, text, imageUrl }) => {
    try {
      const service = require('./modules/messaging/messaging.service');
      const message = await service.sendMessage(userId, conversationId, {
        text,
        image_url: imageUrl,
      });

      // Get recipient
      const conv = await db('conversations').where({ id: conversationId }).first();
      const recipientId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;

      // Send to recipient
      io.to(`user:${recipientId}`).emit('message:new', { message });
      // Confirm delivery to sender
      socket.emit('message:delivered', { messageId: message.id });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // Handle message:read event
  socket.on('message:read', async ({ conversationId }) => {
    try {
      const service = require('./modules/messaging/messaging.service');
      const result = await service.markAsRead(userId, conversationId);

      const conv = await db('conversations').where({ id: conversationId }).first();
      const otherId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;

      io.to(`user:${otherId}`).emit('message:read', {
        conversationId,
        readAt: result.read_at,
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // Handle typing events
  socket.on('typing:start', async ({ conversationId }) => {
    try {
      const conv = await db('conversations').where({ id: conversationId }).first();
      if (!conv) return;
      const otherId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;
      io.to(`user:${otherId}`).emit('typing', { conversationId, userId, typing: true });
    } catch {
      // Ignore typing errors
    }
  });

  socket.on('typing:stop', async ({ conversationId }) => {
    try {
      const conv = await db('conversations').where({ id: conversationId }).first();
      if (!conv) return;
      const otherId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;
      io.to(`user:${otherId}`).emit('typing', { conversationId, userId, typing: false });
    } catch {
      // Ignore typing errors
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${userId}`);
    onlineUsers.delete(userId);
    io.emit('presence', { userId, online: false });
  });
});

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
