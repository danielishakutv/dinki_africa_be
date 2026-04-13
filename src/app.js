const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

// Trust proxy (behind Apache/Cloudflare)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// Cookie parser
app.use(cookieParser());

// Prevent HTTP parameter pollution
app.use(hpp());

// Compression
app.use(compression());

// Request logging
if (config.env !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check
app.get('/v1/health', async (req, res) => {
  const db = require('./config/database');
  const redis = require('./config/redis');

  let dbStatus = 'ok';
  let redisStatus = 'ok';

  try {
    await db.raw('SELECT 1');
  } catch {
    dbStatus = 'error';
  }

  try {
    await redis.ping();
  } catch {
    redisStatus = 'error';
  }

  const status = dbStatus === 'ok' && redisStatus === 'ok' ? 200 : 503;

  res.status(status).json({
    success: true,
    data: {
      status: status === 200 ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    },
  });
});

// API routes
app.use('/v1/auth', require('./modules/auth/auth.routes'));
app.use('/v1/users', require('./modules/users/users.routes'));
app.use('/v1/customers', require('./modules/customers/customers.routes'));
app.use('/v1/jobs', require('./modules/jobs/jobs.routes'));
app.use('/v1/storefronts', require('./modules/storefronts/storefronts.routes'));

// 404 handler
app.all('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
});

// Global error handler
app.use(errorHandler);

module.exports = app;
